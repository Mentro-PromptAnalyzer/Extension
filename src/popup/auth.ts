// ---------------------------------------------------------------------------
// Auth — Supabase REST calls (no SDK — vanilla fetch only)
// Publishable/anon key is safe to include in extension bundles.
// ---------------------------------------------------------------------------

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  email: string;
}

const SUPABASE_URL = 'https://anmsstuexchqyghqoipt.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFubXNzdHVleGNocXlnaHFvaXB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTYwODIsImV4cCI6MjA5MzMzMjA4Mn0.wwFHPAU2PJEi4brxDVLC-TjGMgbXMkrizCeoyIlpyj0';

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export async function loadSession(): Promise<AuthSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('askbetter_session', (result) => {
      resolve((result['askbetter_session'] as AuthSession | undefined) ?? null);
    });
  });
}

export function saveSession(session: AuthSession | null): void {
  if (session) {
    chrome.storage.local.set({ askbetter_session: session });
  } else {
    chrome.storage.local.remove('askbetter_session');
  }
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
  try {
    const redirectUrl = chrome.identity.getRedirectURL('auth');
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize` +
      `?provider=${provider}` +
      `&redirect_to=${encodeURIComponent(redirectUrl)}`;

    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (callbackUrl) => {
        const err = chrome.runtime.lastError;
        if (err || !callbackUrl) {
          reject(new Error(err?.message ?? 'OAuth cancelled.'));
        } else {
          resolve(callbackUrl);
        }
      });
    });

    const parsedUrl = new URL(responseUrl);
    const params = new URLSearchParams(parsedUrl.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') ?? '';

    if (!accessToken) {
      const errorDesc =
        params.get('error_description') ??
        params.get('error') ??
        new URLSearchParams(parsedUrl.search).get('error_description') ??
        new URLSearchParams(parsedUrl.search).get('error');
      return { error: errorDesc ?? 'OAuth sign-in failed — no token returned.' };
    }

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    const userData = (await userRes.json()) as { email?: string; error?: string };
    if (!userRes.ok) {
      return { error: userData.error ?? 'Failed to fetch user after OAuth.' };
    }

    return {
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        email: userData.email ?? '',
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth sign-in failed.';
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('user')) {
      return { error: '' };
    }
    return { error: msg };
  }
}
