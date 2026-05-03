// ---------------------------------------------------------------------------
// Content script — injected into ChatGPT, Gemini, and Perplexity pages.
// Watches the chat input for changes and runs live analysis.
// ---------------------------------------------------------------------------

import { detectPlatform, findInputElement, getInputText } from './selectors';
import { analyzePrompt } from '../analysis/engine';
import { renderOverlay, hideOverlay } from './overlay';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

function onInputChange(el: HTMLElement): void {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const text = getInputText(el);

    if (text.trim().length < 5) {
      hideOverlay();
      return;
    }

    const score = analyzePrompt(text);
    renderOverlay(score);

    // Send score to background for popup display
    chrome.runtime.sendMessage({ type: 'SCORE_UPDATE', score });
  }, DEBOUNCE_MS);
}

function init(): void {
  const platform = detectPlatform();
  if (!platform) return;

  console.log(`[AskBetter] Detected platform: ${platform.name}`);

  // Poll for the input element (it may not exist yet on page load)
  const pollInterval = setInterval(() => {
    const input = findInputElement(platform);
    if (!input) return;

    clearInterval(pollInterval);
    console.log(`[AskBetter] Found input element, attaching listener`);

    // Listen for input changes
    input.addEventListener('input', () => onInputChange(input));

    // For contenteditable elements, also watch for mutations
    if (!(input instanceof HTMLTextAreaElement)) {
      const observer = new MutationObserver(() => onInputChange(input));
      observer.observe(input, { childList: true, subtree: true, characterData: true });
    }

    // Also watch for the send button click (to track submitted prompts)
    if (platform.sendButtonSelector) {
      const sendBtn = document.querySelector(platform.sendButtonSelector);
      if (sendBtn) {
        sendBtn.addEventListener('click', () => {
          const text = getInputText(input);
          if (text.trim().length > 0) {
            const score = analyzePrompt(text);
            chrome.runtime.sendMessage({ type: 'PROMPT_SUBMITTED', text, score });
          }
          // Hide overlay after sending
          setTimeout(hideOverlay, 500);
        });
      }
    }
  }, 1000);

  // Stop polling after 30 seconds
  setTimeout(() => clearInterval(pollInterval), 30000);
}

// Run when the content script loads
init();
