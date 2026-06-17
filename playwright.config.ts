import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    // Each test gets its own browser context via fixtures — no shared baseURL needed.
    headless: true,
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        // Playwright's chromium channel supports --load-extension.
        // The built dist/ must exist before tests run (ensured by CI job ordering).
        channel: 'chromium',
      },
    },
  ],

  // Do not run vitest unit tests — those are a separate script.
  // This config is only for E2E tests under tests/e2e/.
});
