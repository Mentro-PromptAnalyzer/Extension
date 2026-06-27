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
    clearSession,
  }) => {
    // Ensure no stale session from a previous test run.
    await clearSession();

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // When signed out, Tips and Settings tabs are hidden — only Account is shown.
    const tabs = page.locator('[role="tab"], button').filter({ hasText: /account|tips|settings/i });
    await expect(tabs).toHaveCount(1);

    const accountTab = tabs.filter({ hasText: /account/i });
    await expect(accountTab).toHaveCount(1);
  });

  test('Account tab is active by default', async ({ context, extensionId, clearSession }) => {
    await clearSession();

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

  test('Tips and Settings tabs appear when signed in', async ({
    context,
    extensionId,
    seedSession,
    clearSession,
  }) => {
    // Write a fake valid session directly into chrome.storage.local via the
    // service worker — this is the same key the popup reads on mount.
    await seedSession();

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // All three tabs should now be visible — wait generously for the async
    // storage read + React re-render cycle to complete.
    const tabs = page.locator('[role="tab"], button').filter({ hasText: /account|tips|settings/i });
    await expect(tabs).toHaveCount(3, { timeout: 8_000 });

    await clearSession();
  });

  test('Tips tab renders tip cards when signed in and clicked', async ({
    context,
    extensionId,
    seedSession,
    clearSession,
  }) => {
    await seedSession();

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const tipsTab = page
      .locator('[role="tab"], button')
      .filter({ hasText: /tips/i })
      .first();
    await expect(tipsTab).toBeVisible({ timeout: 8_000 });
    await tipsTab.click();

    // TipsTab renders static tip cards inside the active panel.
    // Scope to the active panel so we don't resolve to the hidden account panel.
    const cards = page.locator('.tab-panel.active .tip-card');
    await expect(cards.first()).toBeVisible({ timeout: 3_000 });

    await clearSession();
  });

  test('Settings tab renders toggles when signed in and clicked', async ({
    context,
    extensionId,
    seedSession,
    clearSession,
  }) => {
    await seedSession();

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const settingsTab = page
      .locator('[role="tab"], button')
      .filter({ hasText: /settings/i })
      .first();
    await expect(settingsTab).toBeVisible({ timeout: 8_000 });
    await settingsTab.click();

    // SettingsTab renders badge and pills toggles.
    // The checkbox inputs are visually hidden by CSS — target the visible toggle-track instead.
    const toggles = page.locator('.toggle-track');
    await expect(toggles.first()).toBeVisible({ timeout: 3_000 });

    await clearSession();
  });
});
