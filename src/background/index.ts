// ---------------------------------------------------------------------------
// Background service worker — message router.
// Delegates to focused modules for auth, AI scoring, and prompt storage.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import type { HeuristicContext } from '../analysis/ai';
import { handleOAuthSignIn } from './auth';
import { fetchAIScore } from './ai-proxy';
import { insertPromptRow, derivePlatform } from './prompts';
import type { PromptMessage } from './prompts';

// Re-export for test access
export { derivePlatform };

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface ScoreMessage {
  type: 'SCORE_UPDATE';
  score: LiveScore;
}

interface AIScoreRequest {
  type: 'AI_SCORE';
  text: string;
  heuristic?: HeuristicContext;
}

interface OAuthRequest {
  type: 'OAUTH_SIGN_IN';
  provider: 'google' | 'github';
}

interface SettingsUpdate {
  type: 'SETTINGS_UPDATE';
  settings: {
    pillsEnabled: boolean;
    badgeEnabled: boolean;
    statsEnabled: boolean;
  };
}

interface GetLatestScore {
  type: 'GET_LATEST_SCORE';
}

type Message =
  | ScoreMessage
  | PromptMessage
  | AIScoreRequest
  | OAuthRequest
  | SettingsUpdate
  | GetLatestScore;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let latestScore: LiveScore | null = null;

let activeSettings = {
  pillsEnabled: true,
  badgeEnabled: true,
  statsEnabled: true,
};

// Load persisted settings on startup
chrome.storage.sync.get('mentro_settings', (result) => {
  if (result['mentro_settings']) {
    activeSettings = { ...activeSettings, ...result['mentro_settings'] };
  }
});

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.type === 'SCORE_UPDATE') {
    latestScore = message.score;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PROMPT_SUBMITTED') {
    latestScore = message.score;
    sendResponse({ ok: true });
    chrome.storage.sync.get('mentro_settings', (result) => {
      const saved = result['mentro_settings'] as { statsEnabled?: boolean } | undefined;
      const statsEnabled = saved?.statsEnabled ?? true;
      if (statsEnabled) void insertPromptRow(message, sender.tab?.url);
    });
    return true;
  }

  if (message.type === 'AI_SCORE') {
    fetchAIScore(message.text, message.heuristic).then((score) => {
      sendResponse({ score });
    });
    return true;
  }

  if (message.type === 'OAUTH_SIGN_IN') {
    handleOAuthSignIn(message.provider).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'SETTINGS_UPDATE') {
    activeSettings = { ...activeSettings, ...message.settings };
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_LATEST_SCORE') {
    sendResponse({ score: latestScore });
    return true;
  }

  sendResponse({ ok: true });
  return true;
});
