// ---------------------------------------------------------------------------
// Ollama async scorer — proxies through the background service worker.
// Content scripts on https:// pages cannot make http:// requests directly
// (Chrome mixed-content block), so we message the background to do the fetch.
// ---------------------------------------------------------------------------

import type { LiveScore } from './engine';

/**
 * Request an Ollama score via the background service worker proxy.
 * Returns null if Ollama is unreachable, times out, or returns invalid JSON.
 */
export async function scoreWithOllama(text: string): Promise<Partial<LiveScore> | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime?.id) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage({ type: 'OLLAMA_SCORE', text }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[AskBetter] OLLAMA_SCORE message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        console.log('[AskBetter] OLLAMA_SCORE response from background:', response);
        resolve(response?.score ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}
