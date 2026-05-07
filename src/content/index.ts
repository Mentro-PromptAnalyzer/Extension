// ---------------------------------------------------------------------------
// Content script — injected into ChatGPT, Gemini, and Perplexity pages.
// Simple rule: if the input has text → show score. If empty → hide score.
// ---------------------------------------------------------------------------

import { detectPlatform, findInputElement, getInputText } from './selectors';
import { analyzePrompt } from '../analysis/engine';
import { renderOverlay, hideOverlay } from './overlay';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

function safeSendMessage(message: object): void {
  try {
    if (!chrome.runtime?.id) return; // context invalidated
    chrome.runtime.sendMessage(message);
  } catch {
    // Extension reloaded while tab was open — nothing to do.
  }
}

function onInputChange(el: HTMLElement, platform: ReturnType<typeof detectPlatform>): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const text = getInputText(el);
    console.log('[AskBetter] input change, text length:', text.length, 'trimmed:', text.trim().length, JSON.stringify(text.slice(0, 50)));

    if (text.trim().length < 5) {
      hideOverlay();
      return;
    }

    const score = analyzePrompt(text);
    renderOverlay(score, el, platform ?? undefined);
    safeSendMessage({ type: 'SCORE_UPDATE', score });
  }, DEBOUNCE_MS);
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
    console.log('[AskBetter] mutation fired');
    onInputChange(input, platform);
  });
  observer.observe(input, { childList: true, subtree: true, characterData: true });
  activeObserver = observer;

  // 'input' event covers direct keyboard input
  input.addEventListener('input', () => {
    console.log('[AskBetter] input event fired');
    onInputChange(input, platform);
  });
  // 'keyup' catches deletions in contenteditable that may not fire 'input'
  input.addEventListener('keyup', () => {
    console.log('[AskBetter] keyup event fired');
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
