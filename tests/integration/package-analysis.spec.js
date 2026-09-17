const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');

/**
 * Tag: @package-analysis
 * Usage: npx playwright test --grep @package-analysis
 */

test.describe('Package Analysis (legacy, unexposed) @package-analysis', () => {
  test('does not link to unregistered Package Analysis view in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'Product Builds' }).first();
    await expect(moduleHeader).toBeVisible();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const packageAnalysisLink = page.locator('aside nav a, aside nav button').filter({ hasText: 'Package Analysis' });
    await expect(packageAnalysisLink).toHaveCount(0);
  });

  test('does not expose unregistered Package Analysis route', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/#/product-builds/package-analysis');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'Package Analysis' })).not.toBeVisible();
    expect(consoleErrors.some(msg => msg.includes('package-analysis'))).toBe(true);
  });
});
