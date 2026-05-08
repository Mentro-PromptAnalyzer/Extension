// ---------------------------------------------------------------------------
// Background service worker
// Handles communication between content scripts and the popup.
// The background worker proxies Ollama requests — content scripts on https://
// pages cannot make http:// requests directly (mixed-content block), but the
// background service worker has no such restriction.
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

interface OllamaRequest {
  type: 'OLLAMA_SCORE';
  text: string;
}

type Message = ScoreMessage | PromptMessage | OllamaRequest;

// Store the latest score for the popup to read
let latestScore: LiveScore | null = null;

// ---------------------------------------------------------------------------
// Ollama proxy — runs here so http://localhost calls aren't blocked by the
// mixed-content policy that applies to content scripts on https:// pages.
// ---------------------------------------------------------------------------

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'llama3.2';
const TIMEOUT_MS = 30_000; // llama3.2 can be slow on first inference

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

Calibration example:
Prompt: "how do i build a good breadth first search algorithm? I will be using python to code this on vscode."
Expected scores: ownership=42, depth=48, critical=25, clarity=62, overall=44, intent="curiosity"
Reasoning: Clear question with language/tool context (clarity=62), asks "how" showing curiosity (depth=48), provides tool context but no prior attempt (ownership=42), doesn't ask about tradeoffs or edge cases (critical=25).

Also provide:
- overall: weighted average (ownership 25%, depth 25%, critical 25%, clarity 25%), rounded to nearest integer
- intent: one of "delegation" | "curiosity" | "collaborative" | "verification"
- suggestions: array of exactly 1-3 short, specific, actionable improvement tips (each under 80 chars). You MUST provide suggestions if overall < 75. Only use an empty array if overall >= 75.

Respond with ONLY valid JSON, no markdown, no explanation:
{"ownership":N,"depth":N,"critical":N,"clarity":N,"overall":N,"intent":"...","suggestions":["tip1","tip2","tip3"]}`;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function fetchOllamaScore(text: string): Promise<Partial<LiveScore> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log('[AskBetter:bg] Fetching from Ollama...');
    const t0 = Date.now();
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt: `${SYSTEM_PROMPT}\n\nPrompt to evaluate:\n${text}`,
        stream: false,
        options: { temperature: 0.1, num_predict: 200 },
      }),
    });

    console.log(`[AskBetter:bg] Ollama HTTP status: ${res.status} (${Date.now() - t0}ms)`);
    if (!res.ok) return null;

    const data = await res.json() as { response?: string };
    console.log('[AskBetter:bg] Raw Ollama response:', data.response?.slice(0, 300));

    const raw = data.response?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[AskBetter:bg] No JSON found in response');
      return null;
    }

    console.log('[AskBetter:bg] Extracted JSON:', jsonMatch[0]);
    const parsed = JSON.parse(jsonMatch[0]) as {
      ownership?: number; depth?: number; critical?: number; clarity?: number;
      overall?: number; intent?: string; suggestions?: unknown[];
    };

    if (
      typeof parsed.ownership !== 'number' ||
      typeof parsed.depth !== 'number' ||
      typeof parsed.critical !== 'number' ||
      typeof parsed.clarity !== 'number'
    ) {
      console.log('[AskBetter:bg] Parsed JSON missing required fields:', parsed);
      return null;
    }

    const ownership = clamp(parsed.ownership);
    const depth     = clamp(parsed.depth);
    const critical  = clamp(parsed.critical);
    const clarity   = clamp(parsed.clarity);
    const overall   = clamp(parsed.overall ?? Math.round((ownership + depth + critical + clarity) / 4));

    const validIntents = new Set(['delegation', 'curiosity', 'collaborative', 'verification']);
    const intent = validIntents.has(parsed.intent ?? '') ? parsed.intent as LiveScore['intent'] : 'unknown';

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];

    const result = { ownership, depth, critical, clarity, overall, intent, suggestions };
    console.log('[AskBetter:bg] Ollama score parsed successfully:', result);
    return result;
  } catch (err) {
    console.log('[AskBetter:bg] Ollama fetch error:', err instanceof Error ? `${err.name}: ${err.message}` : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Message listeners
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'SCORE_UPDATE') {
    latestScore = message.score;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'PROMPT_SUBMITTED') {
    latestScore = message.score;
    console.log('[AskBetter] Prompt submitted:', {
      length: message.text.length,
      score: message.score.overall,
      intent: message.score.intent,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'OLLAMA_SCORE') {
    // Proxy the Ollama fetch and return the result asynchronously
    fetchOllamaScore(message.text).then(score => {
      sendResponse({ score });
    });
    return true; // keep message channel open for async response
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
