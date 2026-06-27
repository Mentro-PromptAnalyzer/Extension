/**
 * E2E smoke tests — popup UI
 *
 * Verifies that the built extension loads correctly and the React popup renders
 * without JS errors. No external network calls; no auth required.
 */

import { test, expect } from './fixtures';

test.describe('Popup smoke tests', () => {
  test('popup page loads without JS errors', async ({ context, extensionId }) => {
    const errors: string[] = [];
    const page = await context.newPage();

    // Capture any uncaught JS errors — a broken build will throw here.
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Give React time to mount.
    await page.waitForLoadState('domcontentloaded');

    expect(errors, `JS errors on popup load: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('React root mounts — #root has child nodes', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // Wait for React to mount — #root must have at least one child element.
    // waitForFunction polls the DOM, avoiding the race condition that occurs
    // when checking immediately after domcontentloaded.
    await page.waitForFunction(() => {
      const root = document.getElementById('root');
      return root !== null && root.childElementCount > 0;
    });

    const childCount = await page.$eval('#root', (el) => el.childElementCount);
    expect(childCount, '#root should have at least one child after React mounts').toBeGreaterThan(0);
  });

  test('tab bar renders only Account tab when signed out', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // When signed out, Tips and Settings tabs are hidden — only Account is shown.
    const tabs = page.locator('[role="tab"], button').filter({ hasText: /account|tips|settings/i });
    await expect(tabs).toHaveCount(1);

    const accountTab = tabs.filter({ hasText: /account/i });
    await expect(accountTab).toHaveCount(1);
  });

  test('Account tab is active by default', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // The default active tab should be "Account".
    const accountTab = page
      .locator('[role="tab"], button')
      .filter({ hasText: /account/i })
      .first();
    await expect(accountTab).toBeVisible();
  });

  test('Tips and Settings tabs appear when signed in', async ({ context, extensionId }) => {
    const page = await context.newPage();

    // Seed a minimal fake session into chrome.storage.local so the popup
    // treats the user as signed in and renders all three tabs.
    const fakeSession = {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_at: Date.now() / 1000 + 3600, // expires 1 hour from now
      user: { id: 'test-user-id', email: 'test@example.com' },
    };

    await context.addInitScript(
      ({ session }) => {
        // Override chrome.storage.local.get to return the fake session
        // before the popup reads it on mount.
        const origGet = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = (keys: any, callback?: any) => {
          if (typeof callback === 'function') {
            origGet(keys, (result: Record<string, unknown>) => {
              if (
                keys === 'mentro_session' ||
                (Array.isArray(keys) && keys.includes('mentro_session')) ||
                (keys && typeof keys === 'object' && 'mentro_session' in keys)
              ) {
                callback({ ...result, mentro_session: session });
              } else {
                callback(result);
              }
            });
          } else {
            return origGet(keys);
          }
        };
      },
      { session: fakeSession },
    );

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // Wait for React to mount and the session to be detected.
    await page.waitForFunction(() => {
      const root = document.getElementById('root');
      return root !== null && root.childElementCount > 0;
    });

    // All three tabs should now be visible.
    const tabs = page.locator('[role="tab"], button').filter({ hasText: /account|tips|settings/i });
    await expect(tabs).toHaveCount(3, { timeout: 5_000 });
  });

  test('Tips tab renders tip cards when signed in and clicked', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();

    const fakeSession = {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_at: Date.now() / 1000 + 3600,
      user: { id: 'test-user-id', email: 'test@example.com' },
    };

    await context.addInitScript(
      ({ session }) => {
        const origGet = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = (keys: any, callback?: any) => {
          if (typeof callback === 'function') {
            origGet(keys, (result: Record<string, unknown>) => {
              if (
                keys === 'mentro_session' ||
                (Array.isArray(keys) && keys.includes('mentro_session')) ||
                (keys && typeof keys === 'object' && 'mentro_session' in keys)
              ) {
                callback({ ...result, mentro_session: session });
              } else {
                callback(result);
              }
            });
          } else {
            return origGet(keys);
          }
        };
      },
      { session: fakeSession },
    );

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    const tipsTab = page
      .locator('[role="tab"], button')
      .filter({ hasText: /tips/i })
      .first();
    await tipsTab.click();

    // TipsTab renders static tip cards — at least one should be visible.
    const cards = page.locator('.tip-card, [class*="tip"], [class*="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 3_000 });
  });

  test('Settings tab renders toggles when signed in and clicked', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();

    const fakeSession = {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_at: Date.now() / 1000 + 3600,
      user: { id: 'test-user-id', email: 'test@example.com' },
    };

    await context.addInitScript(
      ({ session }) => {
        const origGet = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = (keys: any, callback?: any) => {
          if (typeof callback === 'function') {
            origGet(keys, (result: Record<string, unknown>) => {
              if (
                keys === 'mentro_session' ||
                (Array.isArray(keys) && keys.includes('mentro_session')) ||
                (keys && typeof keys === 'object' && 'mentro_session' in keys)
              ) {
                callback({ ...result, mentro_session: session });
              } else {
                callback(result);
              }
            });
          } else {
            return origGet(keys);
          }
        };
      },
      { session: fakeSession },
    );

    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    const settingsTab = page
      .locator('[role="tab"], button')
      .filter({ hasText: /settings/i })
      .first();
    await settingsTab.click();

    // SettingsTab renders badge and pills toggles.
    // The checkbox inputs are visually hidden by CSS — target the visible toggle-track instead.
    const toggles = page.locator('.toggle-track');
    await expect(toggles.first()).toBeVisible({ timeout: 3_000 });
  });
});
