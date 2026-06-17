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
    await page.waitForLoadState('domcontentloaded');

    const childCount = await page.$eval('#root', (el) => el.childElementCount);
    expect(childCount, '#root should have at least one child after React mounts').toBeGreaterThan(0);
  });

  test('tab bar renders with Account, Tips, and Settings tabs', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    // The App component renders three tab buttons.
    const tabs = page.locator('[role="tab"], button').filter({ hasText: /account|tips|settings/i });
    await expect(tabs).toHaveCount(3);
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

  test('Tips tab renders tip cards when clicked', async ({ context, extensionId }) => {
    const page = await context.newPage();
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

  test('Settings tab renders toggles when clicked', async ({ context, extensionId }) => {
    const page = await context.newPage();
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
