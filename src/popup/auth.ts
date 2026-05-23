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
// OAuth via chrome.identity.launchWebAuthFlow
// ---------------------------------------------------------------------------

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
