// ---------------------------------------------------------------------------
// Background service worker
// Handles communication between content scripts and the popup.
// Proxies AI scoring requests — content scripts on https:// pages cannot make
// http:// requests directly (mixed-content block), but the background worker
// has no such restriction.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import type { HeuristicContext } from '../analysis/ai';

// ---------------------------------------------------------------------------
// JWT helper — decode exp claim without verifying signature
// ---------------------------------------------------------------------------

function jwtExpBg(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface ScoreMessage {
  type: 'SCORE_UPDATE';
  score: LiveScore;
}

interface PromptMessage {
  type: 'PROMPT_SUBMITTED';
  text: string;
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
// AI scoring backend config
// ---------------------------------------------------------------------------

const SCORE_URL = import.meta.env.VITE_SCORE_URL as string;
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Session helpers — read Supabase JWT from storage so the background worker
// can attach it to outbound requests for server-side auth verification.
// ---------------------------------------------------------------------------

interface StoredSession {
  access_token: string;
  refresh_token: string;
  email: string;
  expires_at?: number; // unix seconds — when the access_token expires
}

async function getStoredSession(): Promise<StoredSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('mentro_session', (result) => {
      resolve((result['mentro_session'] as StoredSession | undefined) ?? null);
    });
  });
}

/** True if the access token expires within the next 5 minutes (or is already expired). */
function isTokenExpiringSoonBg(session: StoredSession): boolean {
  const exp = session.expires_at ?? jwtExpBg(session.access_token);
  if (exp == null) return false; // can't tell — assume OK
  return Date.now() / 1000 > exp - 300; // 5-minute buffer
}

/**
 * Exchange a refresh_token for a new access_token.
 * Persists the updated session to storage and returns it, or null on failure.
 */
async function refreshStoredSession(session: StoredSession): Promise<StoredSession | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      user?: { email?: string };
    };
    if (!data.access_token) return null;
    const updated: StoredSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? session.refresh_token,
      email: data.user?.email ?? session.email,
      expires_at: data.expires_at ?? jwtExpBg(data.access_token) ?? undefined,
    };
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ mentro_session: updated }, resolve);
    });
    return updated;
  } catch {
    return null;
  }
}

/**
 * Load the stored session and proactively refresh the access token if it is
 * expiring soon. Returns a valid access token, or null if not signed in.
 */
async function getValidAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  if (!session) return null;
  if (isTokenExpiringSoonBg(session)) {
    const refreshed = await refreshStoredSession(session);
    return refreshed?.access_token ?? session.access_token;
  }
  return session.access_token;
}

// ---------------------------------------------------------------------------
// AI system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at evaluating the quality of prompts sent to AI assistants.
Score the given prompt on exactly these 4 dimensions, each 0-100:

- ownership (0-100): Does the user provide context, constraints, or their own thinking?
  0 = single vague word ("fix"), 40 = clear question with some context, 70 = shows prior attempt or reasoning, 100 = detailed context + attempts + reasoning
- depth (0-100): Does it seek understanding rather than just an answer?
  0 = "give me X", 40 = "how do I X" with some specifics, 70 = asks why/how with follow-up curiosity, 100 = probes underlying concepts deeply
- critical (0-100): Does it probe edge cases, tradeoffs, or alternatives?
  0 = no probing at all, 40 = implicitly scoped, 70 = asks about tradeoffs or alternatives, 100 = explicitly asks about risks, edge cases, and alternatives
- clarity (0-100): Is it specific, well-contextualized, and unambiguous?
  0 = completely vague, 40 = clear intent with basic context, 70 = specific goal + constraints + format, 100 = crystal clear with all relevant context

Calibration examples:

Example 1 — vague/meaningless prompt:
Prompt: "test test test"
Expected scores: ownership=5, depth=5, critical=5, clarity=0, overall=4, intent="delegation"
Suggestions must be about the literal words "test test test" — do NOT reference any other topic.
Example suggestions: ["What are you trying to test? Describe the specific thing you want to check.", "Add context — is this a software test, a language test, or something else?", "What outcome are you expecting from this test?"]

Example 2 — short delegation prompt:
Prompt: "fix my code"
Expected scores: ownership=10, depth=15, critical=10, clarity=5, overall=10, intent="delegation"
Example suggestions: ["Share the code you want fixed and describe what it should do.", "What error or behavior are you seeing that needs fixing?", "What have you already tried to fix it?"]

Example 3 — medium quality prompt with context:
Prompt: "how do i build a good breadth first search algorithm? I will be using python to code this on vscode."
Expected scores: ownership=42, depth=48, critical=25, clarity=62, overall=44, intent="curiosity"
Reasoning: Clear question with language/tool context (clarity=62), asks "how" showing curiosity (depth=48), provides tool context but no prior attempt (ownership=42), doesn't ask about tradeoffs or edge cases (critical=25).

Example 4 — high quality structured delegation prompt:
Prompt: "You are an experienced software engineer and technical writer. I am building a mobile app called FlickIt, which allows users to upload, share, and monetize photos from events and friend groups. Your task is to design a detailed MVP feature breakdown for this app. Please include: Core user features (uploading, feeds, profiles, payments, etc.), Admin or backend features needed to support the system, Suggested database structure at a high level, Key APIs that would be required, Any critical edge cases or risks I should account for in early development. Format your response using clear sections and bullet points. Keep it technical but understandable for a solo developer building the MVP."
Expected scores: ownership=78, depth=65, critical=82, clarity=80, overall=76, intent="delegation"
Reasoning: Strong role-setting and detailed context (ownership=78), explicitly requests edge cases and risks (critical=82), clear format and audience constraints (clarity=80), asks for deliverable rather than understanding so depth is moderate (depth=65).

Example 5 — high quality structured delegation with requirements list (no question marks):
Prompt: "You are a university-level history professor and expert academic writer. I need a comprehensive, well-structured essay on the history of the United States. The essay should cover: A chronological overview of U.S. presidents from George Washington to the present day (highlight major shifts in leadership style and policy), Major wars involving the United States, The outcomes of these wars and their long-term consequences, Key political, economic, and social impacts of each major era. Requirements: Organize the essay chronologically by historical era, Clearly connect events to their political and societal effects, Use formal academic tone but remain readable for an undergraduate audience, Provide a strong introduction and conclusion. Optional: include brief comparisons between different eras."
Expected scores: ownership=72, depth=60, critical=65, clarity=78, overall=69, intent="delegation"
Reasoning: Strong role-setting (professor persona) and detailed structured requirements (clarity=78, ownership=72). Explicit audience spec (undergraduate) and format requirements. No prior attempt or reasoning shown (ownership not higher). Doesn't explicitly ask about risks/edge cases (critical=65). Asks for deliverable not understanding (depth=60). Imperative phrasing without question marks is normal for structured delegation — do NOT penalize for lack of question marks when requirements are clearly listed.

Also provide:
- overall: weighted average (ownership 25%, depth 25%, critical 25%, clarity 25%), rounded to nearest integer
- intent: one of "delegation" | "curiosity" | "collaborative" | "verification"
- suggestions: array of exactly 1-3 improvement tips. Rules for suggestions:
  * Each tip must be a concrete, specific question or phrase the user could literally add to their prompt.
  * Each tip must reference the actual subject matter of the prompt — NEVER reference BFS, graphs, algorithms, or any other topic unless the prompt itself mentions them.
  * Each tip must target a DIFFERENT weak dimension (ownership, depth, critical, or clarity).
  * Keep each tip under 90 characters.
  * Bad example (too generic): "Add more context to your prompt."
  * Good example (specific): "What have you already tried with the BFS implementation? Share your current code."
  * You MUST provide suggestions if overall < 75. Only use an empty array if overall >= 75.

CRITICAL: Your suggestions must only reference topics, technologies, and concepts that appear in the prompt being evaluated. Never invent topics.

Respond with ONLY valid JSON, no markdown, no explanation:
{"ownership":N,"depth":N,"critical":N,"clarity":N,"overall":N,"intent":"...","suggestions":["tip1","tip2","tip3"]}`;

// ---------------------------------------------------------------------------
// Pre-analysis block builder
// Injects pre-computed heuristic signals into the AI prompt so the model
// can skip re-deriving intent/topics and focus on generating suggestions.
// ---------------------------------------------------------------------------

function buildPreAnalysis(heuristic: HeuristicContext): string {
  const weakDims = Object.entries(heuristic.scores)
    .filter(([k, v]) => k !== 'overall' && v < 60)
    .sort(([, a], [, b]) => a - b)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  const flagList = heuristic.flags.length > 0 ? heuristic.flags.join(', ') : 'none';
  const topicList = heuristic.topics.length > 0 ? heuristic.topics.join(', ') : 'unknown';

  const baselineBlock = heuristic.displayedScore
    ? `- Currently displayed score (your baseline): ownership=${heuristic.displayedScore.ownership}, depth=${heuristic.displayedScore.depth}, critical=${heuristic.displayedScore.critical}, clarity=${heuristic.displayedScore.clarity}, overall=${heuristic.displayedScore.overall}
- IMPORTANT: Only score a dimension LOWER than its baseline if the prompt has genuinely gotten worse in that area. If the user has added more context or detail, scores should increase from the baseline. This creates a smooth, progressive scoring experience.`
    : '';

  return `
Pre-analysis from heuristic scorer (use this to inform your suggestions):
- Detected intent: ${heuristic.intent}
- Key topics identified: ${topicList}
- Heuristic scores: ownership=${heuristic.scores.ownership}, depth=${heuristic.scores.depth}, critical=${heuristic.scores.critical}, clarity=${heuristic.scores.clarity}, overall=${heuristic.scores.overall}
- Weakest dimensions: ${weakDims || 'none'}
- Detected signals: ${flagList}
${baselineBlock}
Use the key topics and weak dimensions above to write suggestions that are specific to THIS prompt.
`;
}

// ---------------------------------------------------------------------------
// AI fetch (via Fly.dev /api/chat/stream — SSE)
// ---------------------------------------------------------------------------

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function fetchAIScore(
  text: string,
  heuristic?: HeuristicContext
): Promise<Partial<LiveScore> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) return null;

    const preAnalysis = heuristic ? buildPreAnalysis(heuristic) : '';
    const userContent = `${preAnalysis}\n\nPrompt to evaluate:\n${text}`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    let res = await fetch(SCORE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ messages }),
    });

    // Option B — retry once on 401: the proactive refresh may have been skipped
    // (e.g. token looked valid but was revoked), so attempt one forced refresh.
    if (res.status === 401) {
      console.warn('[score] Got 401 — attempting token refresh and retrying.');
      const session = await getStoredSession();
      if (session) {
        const refreshed = await refreshStoredSession(session);
        if (refreshed) {
          accessToken = refreshed.access_token;
          // Use a fresh controller so the retry gets its own full timeout budget
          // rather than inheriting whatever time remains on the original one.
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), TIMEOUT_MS);
          try {
            res = await fetch(SCORE_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              signal: retryController.signal,
              body: JSON.stringify({ messages }),
            });
          } finally {
            clearTimeout(retryTimer);
          }
        }
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[score] Rate limited (429) — heuristic score will be used.');
      } else {
        console.warn(`[score] Server returned ${res.status}`);
      }
      return null;
    }

    // Stream SSE tokens and accumulate the full response text
    const reader = res.body?.getReader();
    if (!reader) return null;

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE events are separated by double newlines
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk.split(/\r?\n/);
        let event = 'message';
        let payload: unknown = null;

        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) {
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              // ignore malformed JSON
            }
          }
        }

        if (event === 'token') {
          const token = (payload as { text?: string })?.text;
          if (token) accumulated += token;
        } else if (event === 'end') {
          break;
        } else if (event === 'error') {
          return null;
        }
      }
    }

    const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    let parsed: {
      ownership?: number;
      depth?: number;
      critical?: number;
      clarity?: number;
      overall?: number;
      intent?: string;
      suggestions?: unknown[];
    };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }

    if (
      typeof parsed.ownership !== 'number' ||
      typeof parsed.depth !== 'number' ||
      typeof parsed.critical !== 'number' ||
      typeof parsed.clarity !== 'number'
    ) {
      return null;
    }

    const ownership = clamp(parsed.ownership);
    const depth = clamp(parsed.depth);
    const critical = clamp(parsed.critical);
    const clarity = clamp(parsed.clarity);
    const overall = clamp(
      parsed.overall ?? Math.round((ownership + depth + critical + clarity) / 4)
    );

    const validIntents = new Set(['delegation', 'curiosity', 'collaborative', 'verification']);
    const intent = validIntents.has(parsed.intent ?? '')
      ? (parsed.intent as LiveScore['intent'])
      : 'unknown';

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];

    const result = { ownership, depth, critical, clarity, overall, intent, suggestions };
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted') || msg.includes('abort')) {
      console.warn(`[score] Request timed out after ${TIMEOUT_MS}ms`);
    } else {
      console.error('[score] Unexpected error in fetchAIScore:', msg);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// OAuth — runs in the background worker so the context survives popup close
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function handleOAuthSignIn(
  provider: 'google' | 'github'
): Promise<
  { session: { access_token: string; refresh_token: string; email: string } } | { error: string }
> {
  try {
    // Construct the redirect URL manually to ensure an https:// scheme.
    // chrome.identity.getRedirectURL() can return a non-https scheme on
    // non-Chrome Chromium browsers (e.g. Arc on Windows), which causes
    // launchWebAuthFlow to throw "auth url has an invalid scheme".
    const redirectUrl = `https://${chrome.runtime.id}.chromiumapp.org/auth`;
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize` +
      `?provider=${provider}` +
      `&redirect_to=${encodeURIComponent(redirectUrl)}`;

    const callbackUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        const err = chrome.runtime.lastError;
        if (err || !url) reject(new Error(err?.message ?? 'OAuth cancelled.'));
        else resolve(url);
      });
    });

    const parsed = new URL(callbackUrl);
    const params = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') ?? '';

    if (!accessToken) {
      const errorDesc =
        params.get('error_description') ??
        params.get('error') ??
        new URLSearchParams(parsed.search).get('error_description') ??
        new URLSearchParams(parsed.search).get('error');
      return { error: errorDesc ?? 'OAuth sign-in failed — no token returned.' };
    }

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    const userData = (await userRes.json()) as { email?: string; error?: string };
    if (!userRes.ok) return { error: userData.error ?? 'Failed to fetch user after OAuth.' };

    const session = {
      access_token: accessToken,
      refresh_token: refreshToken,
      email: userData.email ?? '',
      expires_at: jwtExpBg(accessToken) ?? undefined,
    };

    // Save session here in the background — survives popup close
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ mentro_session: session }, resolve);
    });

    return { session };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth sign-in failed.';
    if (msg.toLowerCase().includes('cancel')) return { error: '' };
    return { error: msg };
  }
}

// ---------------------------------------------------------------------------
// Platform detection
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
    // malformed URL
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Prompt insert
// ---------------------------------------------------------------------------

const VALID_INTENTS = new Set(['delegation', 'curiosity', 'collaborative', 'verification']);

async function insertPromptRow(
  message: PromptMessage,
  senderUrl: string | undefined
): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return; // not signed in

  const wordCount = message.text.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return; // empty prompt

  // Extract user_id from JWT sub claim — avoids an extra round-trip
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/extension_prompts`, {
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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let latestScore: LiveScore | null = null;

// Active settings — updated when the popup broadcasts SETTINGS_UPDATE
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
// Message listeners
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
    // Read statsEnabled directly from storage to avoid the startup race where
    // the in-memory activeSettings hasn't been populated yet after a SW restart.
    chrome.storage.sync.get('mentro_settings', (result) => {
      const saved = result['mentro_settings'] as { statsEnabled?: boolean } | undefined;
      const statsEnabled = saved?.statsEnabled ?? true; // default on
      if (statsEnabled) void insertPromptRow(message, sender.tab?.url);
    });
    return true;
  }

  if (message.type === 'AI_SCORE') {
    // Proxy the AI fetch and return the result asynchronously
    fetchAIScore(message.text, message.heuristic).then((score) => {
      sendResponse({ score });
    });
    return true; // keep message channel open for async response
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
