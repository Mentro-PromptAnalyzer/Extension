// ---------------------------------------------------------------------------
// Background auth utilities — session management and OAuth flows.
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  email: string;
  expires_at?: number;
}

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------

export function jwtExpBg(token: string): number | null {
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
// Session storage
// ---------------------------------------------------------------------------

export async function getStoredSession(): Promise<StoredSession | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get('mentro_session', (result) => {
      resolve((result['mentro_session'] as StoredSession | undefined) ?? null);
    });
  });
}

export function isTokenExpiringSoonBg(session: StoredSession): boolean {
  const exp = session.expires_at ?? jwtExpBg(session.access_token);
  if (exp == null) return false;
  return Date.now() / 1000 > exp - 300;
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

export async function refreshStoredSession(session: StoredSession): Promise<StoredSession | null> {
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

export async function getValidAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  if (!session) return null;
  if (isTokenExpiringSoonBg(session)) {
    const refreshed = await refreshStoredSession(session);
    return refreshed?.access_token ?? session.access_token;
  }
  return session.access_token;
}

// ---------------------------------------------------------------------------
// OAuth sign-in
// ---------------------------------------------------------------------------

export async function handleOAuthSignIn(
  provider: 'google' | 'github'
): Promise<
  { session: { access_token: string; refresh_token: string; email: string } } | { error: string }
> {
  try {
    const redirectUrl = `https://${chrome.runtime.id}.chromiumapp.org/auth`;
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize` +
      `?provider=${provider}` +
      `&redirect_to=${encodeURIComponent(redirectUrl)}`;

    console.log('[oauth] Starting flow for provider:', provider);
    console.log('[oauth] Redirect URL:', redirectUrl);

    const callbackUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        const err = chrome.runtime.lastError;
        if (err || !url) reject(new Error(err?.message ?? 'OAuth cancelled.'));
        else resolve(url);
      });
    });

    console.log('[oauth] Callback URL received:', callbackUrl);

    const parsed = new URL(callbackUrl);
    const params = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') ?? '';

    console.log('[oauth] Has access_token:', !!accessToken);
    console.log('[oauth] Hash fragment keys:', [...params.keys()].join(', '));

    if (!accessToken) {
      const errorDesc =
        params.get('error_description') ??
        params.get('error') ??
        new URLSearchParams(parsed.search).get('error_description') ??
        new URLSearchParams(parsed.search).get('error');
      console.warn('[oauth] No access token. Error:', errorDesc);
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

    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ mentro_session: session }, resolve);
    });

    return { session };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth sign-in failed.';
    console.warn('[oauth] Caught error:', msg);
    if (msg.toLowerCase().includes('cancel')) return { error: '' };
    return { error: msg };
  }
}
