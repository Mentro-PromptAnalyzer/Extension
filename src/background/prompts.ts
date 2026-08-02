// ---------------------------------------------------------------------------
// Prompt insertion — writes scored prompts to the Supabase extension_prompts table.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import { getValidAccessToken } from './auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const VALID_INTENTS = new Set(['delegation', 'curiosity', 'collaborative', 'verification']);

// ---------------------------------------------------------------------------
// Platform detection from URL
// ---------------------------------------------------------------------------

export function derivePlatform(url: string | undefined): string {
  if (!url) return 'unknown';
  try {
    const host = new URL(url).hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('perplexity.ai')) return 'perplexity';
    if (host.includes('claude.ai')) return 'claude';
  } catch {
    /* malformed URL */
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Insert prompt row
// ---------------------------------------------------------------------------

export interface PromptMessage {
  type: 'PROMPT_SUBMITTED';
  text: string;
  score: LiveScore;
}

export async function insertPromptRow(
  message: PromptMessage,
  senderUrl: string | undefined
): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;

  const wordCount = message.text.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return;

  let userId: string;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: string;
    };
    userId = payload.sub as string;
    if (!userId) return;
  } catch {
    return;
  }

  const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const score = message.score;

  const body = {
    user_id: userId,
    platform: derivePlatform(senderUrl),
    word_count: wordCount,
    score_overall: clampScore(score.overall),
    score_ownership: clampScore(score.ownership),
    score_depth: clampScore(score.depth),
    score_critical: clampScore(score.critical),
    score_clarity: clampScore(score.clarity),
    intent: VALID_INTENTS.has(score.intent) ? score.intent : 'delegation',
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/prompt_scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[prompts] insert failed:', res.status);
    }
  } catch (err) {
    console.warn('[prompts] insert error:', err instanceof Error ? err.message : err);
  }
}
