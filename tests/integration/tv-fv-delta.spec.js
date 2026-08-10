const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * TV/FV Delta was removed from the Reports hub entirely (no "not available"
 * placeholder) — it is no longer reachable via any UI path, including the
 * ?report=tv-fv-delta query param, since ReportsView.vue resolves reports
 * only through the registry array that no longer lists it. The underlying
 * view/composables/server routes are still covered directly by
 * modules/releases/__tests__/client/tv-fv-delta/ and
 * modules/releases/__tests__/server/tv-fv-delta/.
 */
test.describe('TV/FV Delta @tv-fv-delta', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('is not reachable from the Reports hub', async ({ page }) => {
    await page.goto('/#/releases/reports?report=tv-fv-delta');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.getByRole('heading', { name: 'TV vs FV Delta' })).toHaveCount(0);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('TV/FV Delta');

    expect(page.errors).toHaveLength(0);
  });
});
