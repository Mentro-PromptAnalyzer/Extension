// ---------------------------------------------------------------------------
// tests/popup/settings.test.ts
//
// Tests for:
//   - loadSettings / saveSettings (chrome.storage.sync, defaults, persistence)
//   - statsEnabled toggle — verifies the background worker skips the DB insert
//     when the setting is off
//   - deleteAllPrompts — all network calls use mock fetch, no real requests
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../src/popup/settings';
import { deleteAllPrompts } from '../../src/popup/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid JWT with the given sub claim (no real signing). */
function makeJwt(sub: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })
  );
  return `${header}.${payload}.fakesig`;
}

// ---------------------------------------------------------------------------
// chrome.storage.sync mock factory
// Produces an isolated in-memory store so tests don't bleed into each other.
// ---------------------------------------------------------------------------

function makeStorageSyncMock() {
  const store: Record<string, unknown> = {};

  return {
    get: vi.fn((key: string, cb?: (r: Record<string, unknown>) => void) => {
      if (typeof cb === 'function') cb(store[key] !== undefined ? { [key]: store[key] } : {});
    }),
    set: vi.fn((obj: Record<string, unknown>, cb?: () => void) => {
      Object.assign(store, obj);
      if (typeof cb === 'function') cb();
    }),
    _store: store, // expose for assertions
  };
}

// ===========================================================================
// loadSettings
// ===========================================================================

describe('loadSettings', () => {
  let storageMock: ReturnType<typeof makeStorageSyncMock>;

  beforeEach(() => {
    storageMock = makeStorageSyncMock();
    // @ts-expect-error — replace chrome stub from setup.ts for this test block
    globalThis.chrome.storage.sync = storageMock;
  });

  it('returns DEFAULT_SETTINGS when storage is empty', async () => {
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns merged settings when storage has a saved value', async () => {
    storageMock._store['mentro_settings'] = { pillsEnabled: false, badgeEnabled: true, statsEnabled: true };
    const settings = await loadSettings();
    expect(settings.pillsEnabled).toBe(false);
    expect(settings.badgeEnabled).toBe(true);
    expect(settings.statsEnabled).toBe(true);
  });

  it('fills in missing keys with defaults when storage is partially populated', async () => {
    // Only statsEnabled is stored — the rest should fall back to defaults
    storageMock._store['mentro_settings'] = { statsEnabled: false };
    const settings = await loadSettings();
    expect(settings.statsEnabled).toBe(false);
    expect(settings.pillsEnabled).toBe(DEFAULT_SETTINGS.pillsEnabled);
    expect(settings.badgeEnabled).toBe(DEFAULT_SETTINGS.badgeEnabled);
  });

  it('calls chrome.storage.sync.get with the correct key', async () => {
    await loadSettings();
    expect(storageMock.get).toHaveBeenCalledWith('mentro_settings', expect.any(Function));
  });
});

// ===========================================================================
// saveSettings
// ===========================================================================

describe('saveSettings', () => {
  let storageMock: ReturnType<typeof makeStorageSyncMock>;
  let tabsQueryMock: ReturnType<typeof vi.fn>;
  let tabsSendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storageMock = makeStorageSyncMock();
    tabsSendMock = vi.fn().mockResolvedValue(undefined);
    tabsQueryMock = vi.fn((_filter: unknown, cb: (tabs: chrome.tabs.Tab[]) => void) => {
      cb([{ id: 1 } as chrome.tabs.Tab, { id: 2 } as chrome.tabs.Tab]);
    });

    // @ts-expect-error — replace stubs
    globalThis.chrome.storage.sync = storageMock;
    // @ts-expect-error
    globalThis.chrome.tabs = { query: tabsQueryMock, sendMessage: tabsSendMock };
  });

  it('persists the settings object under mentro_settings key', () => {
    const settings = { pillsEnabled: false, badgeEnabled: true, statsEnabled: false };
    saveSettings(settings);
    expect(storageMock.set).toHaveBeenCalledWith({ mentro_settings: settings });
  });

  it('broadcasts SETTINGS_UPDATE to all tabs', () => {
    const settings = { pillsEnabled: true, badgeEnabled: false, statsEnabled: true };
    saveSettings(settings);
    expect(tabsQueryMock).toHaveBeenCalled();
    // sendMessage is called once per tab
    expect(tabsSendMock).toHaveBeenCalledTimes(2);
    expect(tabsSendMock).toHaveBeenCalledWith(1, { type: 'SETTINGS_UPDATE', settings });
    expect(tabsSendMock).toHaveBeenCalledWith(2, { type: 'SETTINGS_UPDATE', settings });
  });

  it('round-trips through loadSettings after saving', async () => {
    const settings = { pillsEnabled: false, badgeEnabled: false, statsEnabled: false };
    saveSettings(settings);
    const loaded = await loadSettings();
    expect(loaded).toEqual(settings);
  });
});

// ===========================================================================
// statsEnabled — background worker skips DB insert when the setting is off
// ===========================================================================

describe('statsEnabled setting controls DB insert', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let storageSyncMock: ReturnType<typeof makeStorageSyncMock>;
  let storageLocalMock: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
  let capturedMessageListener: ((
    msg: { type: string; text?: string; score?: unknown },
    sender: { tab?: { url?: string } },
    sendResponse: (r: unknown) => void
  ) => boolean) | null;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    storageSyncMock = makeStorageSyncMock();
    capturedMessageListener = null;

    storageLocalMock = {
      get: vi.fn((_key: string, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn(),
    };

    // Capture the onMessage listener so we can call it directly in tests
    // @ts-expect-error
    globalThis.chrome.runtime.onMessage.addListener = vi.fn((listener) => {
      capturedMessageListener = listener as typeof capturedMessageListener;
    });
    // @ts-expect-error
    globalThis.chrome.storage.sync = storageSyncMock;
    // @ts-expect-error
    globalThis.chrome.storage.local = storageLocalMock;

    // Re-import triggers module initialisation which registers the listener.
    // We use vi.resetModules() so each test gets a fresh module instance.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does NOT call fetch for the DB insert when statsEnabled is false', async () => {
    // Set statsEnabled=false in the storage sync mock
    storageSyncMock._store['mentro_settings'] = { statsEnabled: false };

    // Load the background module fresh so its message listener is registered
    await import('../../src/background/index');

    expect(capturedMessageListener).not.toBeNull();

    const score = {
      overall: 60,
      ownership: 55,
      depth: 60,
      critical: 65,
      clarity: 58,
      intent: 'delegation',
      suggestions: [],
      flags: [],
    };

    const sendResponse = vi.fn();
    capturedMessageListener!(
      { type: 'PROMPT_SUBMITTED', text: 'test prompt text', score },
      { tab: { url: 'https://chatgpt.com/' } },
      sendResponse
    );

    // Wait for the async storage.get + optional fetch to settle
    await new Promise((r) => setTimeout(r, 50));

    // fetch should NOT have been called for the DB insert
    const dbInsertCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('extension_prompts')
    );
    expect(dbInsertCall).toBeUndefined();
  });

  it('DOES call fetch for the DB insert when statsEnabled is true', async () => {
    // statsEnabled=true (default) — session must exist so the insert is attempted
    storageSyncMock._store['mentro_settings'] = { statsEnabled: true };

    const token = makeJwt('user-abc-123');
    storageLocalMock.get = vi.fn((_key: string, cb: (r: Record<string, unknown>) => void) =>
      cb({ mentro_session: { access_token: token, refresh_token: 'rt', email: 'a@b.com' } })
    );

    // Mock a successful DB insert response
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    await import('../../src/background/index');

    expect(capturedMessageListener).not.toBeNull();

    const score = {
      overall: 72,
      ownership: 70,
      depth: 75,
      critical: 68,
      clarity: 80,
      intent: 'curiosity',
      suggestions: [],
      flags: [],
    };

    const sendResponse = vi.fn();
    capturedMessageListener!(
      { type: 'PROMPT_SUBMITTED', text: 'explain how neural networks learn', score },
      { tab: { url: 'https://chatgpt.com/' } },
      sendResponse
    );

    await new Promise((r) => setTimeout(r, 50));

    const dbInsertCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('extension_prompts')
    );
    expect(dbInsertCall).toBeDefined();
    // Confirm it was a POST to the correct endpoint
    expect(dbInsertCall![1].method).toBe('POST');
  });
});

// ===========================================================================
// deleteAllPrompts
// ===========================================================================

describe('deleteAllPrompts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns ok:true when the DELETE request succeeds (204)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const token = makeJwt('user-test-999');
    const result = await deleteAllPrompts(token);
    expect(result.ok).toBe(true);
  });

  it('sends a DELETE request to the extension_prompts endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const token = makeJwt('user-test-999');
    await deleteAllPrompts(token);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('extension_prompts');
    expect(options.method).toBe('DELETE');
  });

  it('includes the user_id filter in the URL so only own rows are deleted', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const sub = 'user-filter-check';
    const token = makeJwt(sub);
    await deleteAllPrompts(token);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`user_id=eq.${encodeURIComponent(sub)}`);
  });

  it('sends the Authorization header with the Bearer token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const token = makeJwt('user-auth-header');
    await deleteAllPrompts(token);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${token}`);
  });

  it('returns ok:false with an error message when the server returns 500', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    });
    const token = makeJwt('user-server-error');
    const result = await deleteAllPrompts(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('500');
  });

  it('returns ok:false when the token has no sub claim', async () => {
    // Build a JWT with no sub
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: 9999999999 }));
    const badToken = `${header}.${payload}.sig`;

    const result = await deleteAllPrompts(badToken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/user id/i);
    // No fetch should have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ok:false on a network error', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    const token = makeJwt('user-network-fail');
    const result = await deleteAllPrompts(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Failed to fetch');
  });
});
