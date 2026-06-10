// ---------------------------------------------------------------------------
// AI async scorer — proxies through the background service worker.
// Content scripts on https:// pages cannot make http:// requests directly
// (mixed-content block), so we message the background to do the fetch.
// ---------------------------------------------------------------------------

import type { LiveScore } from './engine';

/** Pre-computed heuristic context passed alongside the raw prompt text.
 *  The AI scorer uses this to skip re-deriving what we already know and focus
 *  its tokens on generating specific, grounded suggestions. */
export interface HeuristicContext {
  intent: LiveScore['intent'];
  flags: string[];
  scores: {
    ownership: number;
    depth: number;
    critical: number;
    clarity: number;
    overall: number;
  };
  topics: string[]; // top TF-IDF phrases, most important first
  /** The score currently displayed to the user (blended heuristic+AI).
   *  The AI uses this as a baseline — scores should only increase from here
   *  unless the prompt has genuinely gotten worse. */
  displayedScore?: {
    ownership: number;
    depth: number;
    critical: number;
    clarity: number;
    overall: number;
  };
}

/**
 * Request an AI score via the background service worker proxy.
 * Returns null if the backend is unreachable, times out, or returns invalid JSON.
 */
export async function scoreWithGroq(
  text: string,
  heuristic?: HeuristicContext
): Promise<Partial<LiveScore> | null> {
  return new Promise((resolve) => {
    try {
      if (!chrome.runtime?.id) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage({ type: 'GROQ_SCORE', text, heuristic }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Mentro] AI score message error:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(response?.score ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}
