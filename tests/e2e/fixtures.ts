/**
 * Shared Playwright fixtures for Chrome extension testing.
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *
 * The `extensionId` fixture gives you the unpacked extension's ID so you can
 * navigate directly to chrome-extension://<id>/popup.html.
 */

import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

// The extension root is two directories up from tests/e2e/
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  // Override the default context to load the unpacked extension.
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_ROOT}`,
        `--load-extension=${EXTENSION_ROOT}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
      ],
    });
    await use(ctx);
    await ctx.close();
  },

  // Derive the extension ID from the service worker URL that Chrome registers.
  extensionId: async ({ context }, use) => {
    // Wait for the background service worker to appear — it registers shortly
    // after the extension loads.
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    // URL format: chrome-extension://<id>/dist/background.js
    const id = background.url().split('/')[2];
    await use(id);
  },
});

export { expect } from '@playwright/test';
