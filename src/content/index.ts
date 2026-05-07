// ---------------------------------------------------------------------------
// Content script — injected into ChatGPT, Gemini, and Perplexity pages.
// Simple rule: if the input has text → show score. If empty → hide score.
// ---------------------------------------------------------------------------

import { detectPlatform, findInputElement, getInputText } from './selectors';
import { analyzePrompt } from '../analysis/engine';
import { renderOverlay, hideOverlay, setBadgeLoading } from './overlay';
import { scoreWithOllama } from '../analysis/ollama';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let ollamaTimer: ReturnType<typeof setTimeout> | null = null;
let pulseTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;
const PULSE_DELAY_MS = 600;  // delay after heuristic before pulse starts
const OLLAMA_EXTRA_MS = 1200; // additional wait after heuristic fires before hitting Ollama (total = 1500ms from last keystroke)

function safeSendMessage(message: object): void {
  try {
    if (!chrome.runtime?.id) return; // context invalidated
    chrome.runtime.sendMessage(message);
  } catch {
    // Extension reloaded while tab was open — nothing to do.
  }
}

// Generation counter — incremented once per input change so stale Ollama
// responses don't overwrite a newer score.
let currentOllamaGen = 0;

function onInputChange(el: HTMLElement, platform: ReturnType<typeof detectPlatform>): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (ollamaTimer) clearTimeout(ollamaTimer);

  // Cancel pulse immediately if the user resumes typing
  if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; }
  setBadgeLoading(false);

  debounceTimer = setTimeout(() => {
    const text = getInputText(el);
    console.log('[AskBetter] input change, text length:', text.length, 'trimmed:', text.trim().length, JSON.stringify(text.slice(0, 50)));

    if (text.trim().length < 5) {
      hideOverlay();
      return;
    }

    // Layer 1: instant heuristic score
    const heuristicScore = analyzePrompt(text);
    renderOverlay(heuristicScore, el, platform ?? undefined);
    safeSendMessage({ type: 'SCORE_UPDATE', score: heuristicScore });

    // Bump gen once, here, after the heuristic fires
    const gen = ++currentOllamaGen;

    // Start pulse after a short delay — feels natural, not jarring
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      setBadgeLoading(true);
    }, PULSE_DELAY_MS);

    // Layer 2: async Ollama re-score after typing fully settles
    ollamaTimer = setTimeout(() => {
      scheduleOllamaScore(text, heuristicScore, el, platform, gen);
    }, OLLAMA_EXTRA_MS);
  }, DEBOUNCE_MS);
}

async function scheduleOllamaScore(
  text: string,
  heuristicScore: ReturnType<typeof analyzePrompt>,
  el: HTMLElement,
  platform: ReturnType<typeof detectPlatform>,
  gen: number,
): Promise<void> {
  console.log('[AskBetter] Ollama scoring started');

  const aiScore = await scoreWithOllama(text);

  // If the user kept typing, a newer generation is running — discard this result
  if (gen !== currentOllamaGen) return;

  // Stop pulsing regardless of whether Ollama succeeded
  setBadgeLoading(false);

  if (!aiScore) {
    console.log('[AskBetter] Ollama unavailable or returned invalid response');
    return;
  }

  // Merge AI scores over the heuristic base — flags come from heuristic,
  // everything else (scores, intent, suggestions) comes from Ollama.
  const merged = { ...heuristicScore, ...aiScore };

  console.log('[AskBetter] Ollama score received:', merged.overall);
  renderOverlay(merged, el, platform ?? undefined);
  safeSendMessage({ type: 'SCORE_UPDATE', score: merged });
}

let activeInput: HTMLElement | null = null;
let activeObserver: MutationObserver | null = null;

function attachToInput(input: HTMLElement, platform: ReturnType<typeof detectPlatform>): void {
  // Disconnect any previous observer
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }
  activeInput = input;

  console.log(`[AskBetter] Attaching observer to input`, input.id, input.className);

  // Score immediately — text may already be present
  onInputChange(input, platform);

  // MutationObserver for contenteditable changes
  const observer = new MutationObserver(() => {
    onInputChange(input, platform);
  });
  observer.observe(input, { childList: true, subtree: true, characterData: true });
  activeObserver = observer;

  // 'input' event covers direct keyboard input
  input.addEventListener('input', () => {
    onInputChange(input, platform);
  });
  // 'keyup' catches deletions in contenteditable that may not fire 'input'
  input.addEventListener('keyup', () => {
    onInputChange(input, platform);
  });

  // Track submitted prompts for the popup/background
  input.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' && !ke.shiftKey) {
      const text = getInputText(input);
      if (text.trim().length > 0) {
        safeSendMessage({ type: 'PROMPT_SUBMITTED', text, score: analyzePrompt(text) });
      }
    }
  });

  if (platform?.sendButtonSelector) {
    const sendBtn = document.querySelector(platform.sendButtonSelector);
    sendBtn?.addEventListener('click', () => {
      const text = getInputText(input);
      if (text.trim().length > 0) {
        safeSendMessage({ type: 'PROMPT_SUBMITTED', text, score: analyzePrompt(text) });
      }
    });
  }
}

function init(): void {
  const platform = detectPlatform();
  if (!platform) return;

  console.log(`[AskBetter] Detected platform: ${platform.name}`);

  // Poll until the input element exists, then re-check periodically in case
  // the SPA replaces the element (e.g. ChatGPT new-chat navigation).
  const pollInterval = setInterval(() => {
    const input = findInputElement(platform);
    if (!input) return;

    // Re-attach if the element is new (first time, or SPA replaced it)
    if (input !== activeInput) {
      clearInterval(pollInterval);
      attachToInput(input, platform);

      // Keep a slower heartbeat to re-attach if the element is ever replaced
      setInterval(() => {
        const current = findInputElement(platform);
        if (current && current !== activeInput) {
          console.log('[AskBetter] Input element replaced, re-attaching');
          attachToInput(current, platform);
        }
      }, 1000);
    }
  }, 500);

  setTimeout(() => clearInterval(pollInterval), 30_000);
}

init();

// ---------------------------------------------------------------------------
// SPA navigation detection — ChatGPT swaps URLs without a page reload.
// Hide the badge whenever the user navigates to a different chat.
// ---------------------------------------------------------------------------
let lastUrl = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    hideOverlay();
    // Re-check the input after navigation — the new chat may have a draft
    setTimeout(() => {
      const platform = detectPlatform();
      if (!platform) return;
      const input = findInputElement(platform);
      if (input) onInputChange(input, platform);
    }, 800);
  }
});
navObserver.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------------
// Tab visibility — when the user switches back to this tab, re-score the
// current input text so the badge reflects any changes made while away.
// ---------------------------------------------------------------------------
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeInput) {
    onInputChange(activeInput, detectPlatform());
  }
});
