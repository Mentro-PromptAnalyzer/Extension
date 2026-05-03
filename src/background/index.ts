// ---------------------------------------------------------------------------
// Background service worker
// Handles communication between content scripts and the popup.
// Optionally syncs data with the AskBetter backend.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';

interface ScoreMessage {
  type: 'SCORE_UPDATE';
  score: LiveScore;
}

interface PromptMessage {
  type: 'PROMPT_SUBMITTED';
  text: string;
  score: LiveScore;
}

type Message = ScoreMessage | PromptMessage;

// Store the latest score for the popup to read
let latestScore: LiveScore | null = null;

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'SCORE_UPDATE') {
    latestScore = message.score;
  }

  if (message.type === 'PROMPT_SUBMITTED') {
    latestScore = message.score;

    // TODO: Optionally send to AskBetter backend for dashboard tracking
    // const API_BASE = 'https://ask-better-kiro-hacks.vercel.app';
    // fetch(`${API_BASE}/api/track-prompt`, { ... });

    console.log('[AskBetter] Prompt submitted:', {
      length: message.text.length,
      score: message.score.overall,
      intent: message.score.intent,
    });
  }

  sendResponse({ ok: true });
  return true;
});

// Handle popup requesting the latest score
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_LATEST_SCORE') {
    sendResponse({ score: latestScore });
  }
  return true;
});
