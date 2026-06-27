// ---------------------------------------------------------------------------
// Vitest global setup — stubs browser extension APIs that are unavailable
// in the Node.js test environment.
// ---------------------------------------------------------------------------

// Stub import.meta.env values used at module-level in source files
// (vitest exposes import.meta.env but the vars are undefined without define)
Object.assign(import.meta.env, {
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_SCORE_URL: 'https://test.fly.dev/api/chat/stream',
});

// Minimal chrome extension API stub — only the surfaces touched at module load
// time by src/background/index.ts and src/popup/auth.ts are needed here.
// Tests for pure functions (derivePlatform, aggregateStats, computeTopIntent)
// never actually call these, but the module initialisation code references them.
const chromeMock = {
  storage: {
    local: {
      get: () => {},
      set: () => {},
      remove: () => {},
    },
    sync: {
      get: (_key: string, _cb?: (result: Record<string, unknown>) => void) => {
        if (typeof _cb === 'function') _cb({});
      },
      set: () => {},
    },
    onChanged: {
      addListener: () => {},
    },
  },
  runtime: {
    onMessage: {
      addListener: () => {},
    },
    lastError: undefined,
    id: 'test-extension-id',
    sendMessage: () => {},
  },
  identity: {
    launchWebAuthFlow: () => {},
    getRedirectURL: () => 'https://test.chromiumapp.org/auth',
  },
  tabs: {
    query: () => {},
    sendMessage: () => {},
  },
};

// @ts-expect-error — chrome is not defined in Node; we inject the stub
globalThis.chrome = chromeMock;
