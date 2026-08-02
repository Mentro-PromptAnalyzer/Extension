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

interface ExtensionPromptRow {
  word_count: number;
  score_overall: number;
  intent: string;
  platform: string;
  created_at: string;
}

export interface LifetimeStats {
  totalPrompts: number;
  avgScore: number | null;
  topPlatform: string | null;
  wordCountBuckets: {
    short: number; // word_count 1–15
    medium: number; // word_count 16–50
    long: number; // word_count 51+
    total: number;
  };
  scoreBands: {
    excellent: number; // score_overall 71–100
    good: number; // score_overall 41–70
    needsWork: number; // score_overall 0–40
  };
  intentCounts: Record<'delegation' | 'curiosity' | 'collaborative' | 'verification', number>;
  platformStats: Record<string, { count: number; avgScore: number }>;
}

export function aggregateStats(rows: ExtensionPromptRow[]): LifetimeStats {
  const totalPrompts = rows.length;

  const avgScore =
    totalPrompts === 0
      ? null
      : Math.round(rows.reduce((s, r) => s + r.score_overall, 0) / totalPrompts);

  const wordCountBuckets = { short: 0, medium: 0, long: 0, total: totalPrompts };
  for (const r of rows) {
    if (r.word_count <= 15) wordCountBuckets.short++;
    else if (r.word_count <= 50) wordCountBuckets.medium++;
    else wordCountBuckets.long++;
  }

  const scoreBands = { excellent: 0, good: 0, needsWork: 0 };
  for (const r of rows) {
    if (r.score_overall >= 71) scoreBands.excellent++;
    else if (r.score_overall >= 41) scoreBands.good++;
    else scoreBands.needsWork++;
  }

  const intentCounts: LifetimeStats['intentCounts'] = {
    delegation: 0,
    curiosity: 0,
    collaborative: 0,
    verification: 0,
  };
  for (const r of rows) {
    const k = r.intent as keyof typeof intentCounts;
    if (k in intentCounts) intentCounts[k]++;
  }

  const platformMap: Record<string, { sum: number; count: number }> = Object.create(null);
  for (const r of rows) {
    if (!Object.prototype.hasOwnProperty.call(platformMap, r.platform)) {
      platformMap[r.platform] = { sum: 0, count: 0 };
    }
    platformMap[r.platform].sum += r.score_overall;
    platformMap[r.platform].count++;
  }
  const platformStats: LifetimeStats['platformStats'] = Object.create(null);
  for (const [p, { sum, count }] of Object.entries(platformMap)) {
    platformStats[p] = { count, avgScore: Math.round(sum / count) };
  }

  const topPlatform =
    totalPrompts === 0
      ? null
      : Object.entries(platformStats).sort((a, b) => b[1].count - a[1].count)[0][0];

  return {
    totalPrompts,
    avgScore,
    topPlatform,
    wordCountBuckets,
    scoreBands,
    intentCounts,
    platformStats,
  };
}

export async function fetchLifetimeStats(
  accessToken: string
): Promise<{ ok: true; stats: LifetimeStats } | { ok: false }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/extension_prompts` +
        `?select=word_count,score_overall,score_ownership,score_depth,score_critical,score_clarity,intent,platform,created_at` +
        `&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) return { ok: false };
    const rows = (await res.json()) as ExtensionPromptRow[];
    return { ok: true, stats: aggregateStats(rows) };
  } catch {
    return { ok: false };
  }
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

// ---------------------------------------------------------------------------
// Data deletion
// ---------------------------------------------------------------------------

/**
 * Delete all extension_prompts rows for the current user.
 * RLS ensures only the authenticated user's own rows are deleted.
 */
export async function deleteAllPrompts(
  accessToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // RLS scopes the DELETE to the authenticated user's own rows.
    // The user_id filter is redundant but acts as a safety net — Supabase
    // requires at least one filter on DELETE to prevent accidental full-table wipes.
    const userId = getUserIdFromToken(accessToken);
    if (!userId) return { ok: false, error: 'Could not read user ID from token.' };

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/extension_prompts?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'return=minimal',
        },
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Server returned ${res.status}${body ? `: ${body}` : ''}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/** Extract the user UUID from a JWT sub claim without signature verification. */
function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}
