// ---------------------------------------------------------------------------
// Auth — Supabase REST calls (no SDK — vanilla fetch only)
// Publishable/anon key is safe to include in extension bundles.
// ---------------------------------------------------------------------------

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  email: string;
  expires_at?: number; // unix seconds — when the access_token expires
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/** Decode the `exp` claim from a JWT without verifying the signature. */
function jwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url → base64 → JSON
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

/** True if the access token expires within the next 5 minutes (or is already expired). */
function isTokenExpiringSoon(session: AuthSession): boolean {
  const exp = session.expires_at ?? jwtExp(session.access_token);
  if (exp == null) return false; // can't tell — assume OK
  return Date.now() / 1000 > exp - 300; // 5-minute buffer
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export async function loadSession(): Promise<AuthSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('mentro_session', (result) => {
      resolve((result['mentro_session'] as AuthSession | undefined) ?? null);
    });
  });
}

export function saveSession(session: AuthSession | null): void {
  if (session) {
    chrome.storage.local.set({ mentro_session: session });
  } else {
    chrome.storage.local.remove('mentro_session');
  }
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

/**
 * Exchange a refresh_token for a new access_token.
 * Persists the updated session and returns it, or null on failure.
 */
export async function refreshSession(session: AuthSession): Promise<AuthSession | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      user?: { email?: string };
    };
    if (!data.access_token) return null;
    const updated: AuthSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? session.refresh_token,
      email: data.user?.email ?? session.email,
      expires_at: data.expires_at ?? jwtExp(data.access_token) ?? undefined,
    };
    saveSession(updated);
    return updated;
  } catch {
    return null;
  }
}

/**
 * Load the stored session and refresh the access token if it's expiring soon.
 * Returns the (possibly refreshed) session, or null if not signed in or refresh fails.
 */
export async function getValidSession(): Promise<AuthSession | null> {
  const session = await loadSession();
  if (!session) return null;
  if (!isTokenExpiringSoon(session)) return session;
  // Token is stale — try to refresh silently
  const refreshed = await refreshSession(session);
  return refreshed ?? session; // fall back to stale session if refresh fails
}

// ---------------------------------------------------------------------------
// Email / password
// ---------------------------------------------------------------------------

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ session: AuthSession } | { error: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: { email?: string };
      error_description?: string;
      msg?: string;
    };
    if (!res.ok || !data.access_token) {
      return { error: data.error_description ?? data.msg ?? 'Sign in failed.' };
    }
    return {
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? '',
        email: data.user?.email ?? email,
        expires_at: jwtExp(data.access_token) ?? undefined,
      },
    };
  } catch {
    return { error: 'Network error — check your connection.' };
  }
}

export async function signOut(accessToken: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Best-effort — clear local session regardless
  }
}

// ---------------------------------------------------------------------------
// Lifetime stats — fetched from Supabase REST using the user's access token
// ---------------------------------------------------------------------------

export interface SessionRow {
  overall_score: number;
  prompt_count: number;
  platform: string;
  title: string;
  created_at: string;
  analysis_result: {
    prompts?: Array<{ wordCount?: number }>;
  } | null;
}

export interface WordCountBuckets {
  short: number; // 1–15 words
  medium: number; // 16–50 words
  long: number; // 51+ words
  total: number;
}

export interface LifetimeStats {
  totalPrompts: number;
  avgScore: number | null;
  totalSessions: number;
  topPlatform: string | null;
  // Raw data for detail views
  sessions: SessionRow[];
  platformCounts: Record<string, number>;
  platformAvgScores: Record<string, number>;
  wordCountBuckets: WordCountBuckets;
}

export async function fetchLifetimeStats(accessToken: string): Promise<LifetimeStats> {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const [histRes, analysisRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/chat_histories?select=overall_score,prompt_count,platform,title,created_at,analysis_result&order=created_at.desc`,
      { headers }
    ),
    fetch(`${SUPABASE_URL}/rest/v1/analysis_history?select=prompt_count`, { headers }),
  ]);

  type AnalysisRow = { prompt_count: number };

  const sessions: SessionRow[] = histRes.ok ? ((await histRes.json()) as SessionRow[]) : [];
  const analysisRows: AnalysisRow[] = analysisRes.ok
    ? ((await analysisRes.json()) as AnalysisRow[])
    : [];

  const totalSessions = sessions.length;

  const totalPrompts =
    analysisRows.length > 0
      ? analysisRows.reduce((sum, r) => sum + (r.prompt_count ?? 0), 0)
      : sessions.reduce((sum, r) => sum + (r.prompt_count ?? 0), 0);

  const scoredRows = sessions.filter((r) => r.overall_score > 0);
  const avgScore =
    scoredRows.length > 0
      ? Math.round(scoredRows.reduce((sum, r) => sum + r.overall_score, 0) / scoredRows.length)
      : null;

  const platformCounts: Record<string, number> = {};
  const platformScoreSums: Record<string, number> = {};
  const platformScoreCounts: Record<string, number> = {};

  for (const r of sessions) {
    if (r.platform && r.platform !== 'unknown') {
      platformCounts[r.platform] = (platformCounts[r.platform] ?? 0) + 1;
      if (r.overall_score > 0) {
        platformScoreSums[r.platform] = (platformScoreSums[r.platform] ?? 0) + r.overall_score;
        platformScoreCounts[r.platform] = (platformScoreCounts[r.platform] ?? 0) + 1;
      }
    }
  }

  const platformAvgScores: Record<string, number> = {};
  for (const p of Object.keys(platformScoreSums)) {
    platformAvgScores[p] = Math.round(platformScoreSums[p] / platformScoreCounts[p]);
  }

  const topPlatform =
    Object.keys(platformCounts).length > 0
      ? Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null;

  // Word count distribution — extracted from analysis_result.prompts[].wordCount
  const wordCountBuckets: WordCountBuckets = { short: 0, medium: 0, long: 0, total: 0 };
  for (const s of sessions) {
    const prompts = s.analysis_result?.prompts ?? [];
    for (const p of prompts) {
      const wc = p.wordCount ?? 0;
      wordCountBuckets.total++;
      if (wc <= 15) wordCountBuckets.short++;
      else if (wc <= 50) wordCountBuckets.medium++;
      else wordCountBuckets.long++;
    }
  }

  return {
    totalPrompts,
    avgScore,
    totalSessions,
    topPlatform,
    sessions,
    platformCounts,
    platformAvgScores,
    wordCountBuckets,
  };
}

export async function signInWithOAuth(
  provider: 'google' | 'github'
): Promise<{ session: AuthSession } | { error: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'OAUTH_SIGN_IN', provider }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ error: err.message ?? 'OAuth failed.' });
        return;
      }
      resolve(response as { session: AuthSession } | { error: string });
    });
  });
}
