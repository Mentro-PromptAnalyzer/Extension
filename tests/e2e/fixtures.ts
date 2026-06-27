/**
 * Shared Playwright fixtures for Chrome extension testing.
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *
 * The `extensionId` fixture gives you the unpacked extension's ID so you can
 * navigate directly to chrome-extension://<id>/popup.html.
 */

import {
  test as base,
  chromium,
  type BrowserContext,
} from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The extension root is two directories up from tests/e2e/
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  /** Write a fake signed-in session to chrome.storage.local. */
  seedSession: () => Promise<void>;
  /** Clear the session from chrome.storage.local. */
  clearSession: () => Promise<void>;
};

const FAKE_SESSION = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  // expires 1 hour from now — isTokenExpiringSoon returns false, no refresh attempted
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  email: 'test@example.com',
};

export const test = base.extend<ExtensionFixtures>({
  // Override the default context to load the unpacked extension.
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext('', {
      headless: true,
      channel: 'chromium',
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

  // Derive the extension ID from the background service worker URL.
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    }
    // URL format: chrome-extension://<id>/dist/background.js
    const id = background.url().split('/')[2];
    await use(id);
  },

  // Helper: write a fake session directly into chrome.storage.local.
  // Runs inside a real extension page so chrome.storage is always available.
  seedSession: async ({ context, extensionId }, use) => {
    const seed = async () => {
      const page = await context.newPage();
      try {
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        await page.waitForFunction(() => typeof chrome !== 'undefined' && !!chrome.storage);
        await page.evaluate(
          (session) =>
            new Promise<void>((resolve) =>
              chrome.storage.local.set({ mentro_session: session }, resolve),
            ),
          FAKE_SESSION,
        );
      } finally {
        await page.close();
      }
    };
    await use(seed);
  },

  // Helper: remove the session so later tests start clean.
  clearSession: async ({ context, extensionId }, use) => {
    const clear = async () => {
      const page = await context.newPage();
      try {
        await page.goto(`chrome-extension://${extensionId}/popup.html`);
        await page.waitForFunction(() => typeof chrome !== 'undefined' && !!chrome.storage);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              chrome.storage.local.remove('mentro_session', resolve),
            ),
        );
      } finally {
        await page.close();
      }
    };
    await use(clear);
  },
});

export { expect } from '@playwright/test';
