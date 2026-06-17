import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
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
});
