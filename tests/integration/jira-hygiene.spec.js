const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * Integration tests for the project-wide Jira Hygiene capability
 * (Releases module → Reports → Jira Hygiene, Manage → Hygiene Rules).
 *
 * These tests prove the new capability is wired through the real
 * application boundaries — API routes, the Reports registry, and the
 * Manage tab — using fixture-backed demo data. Detailed filter/pagination/
 * dedup/chart/Team-accountability behavior is already covered by focused
 * component tests in modules/releases/__tests__/client/, so it is
 * intentionally not re-verified here.
 *
 * Tag: @jira-hygiene
 * Usage: npx playwright test --grep @jira-hygiene
 */

test.describe('Releases — Project Hygiene API @jira-hygiene', () => {
  test('GET project-hygiene results returns the fixture-backed contract', async ({ request }) => {
    const res = await request.get('/api/modules/releases/hygiene/project-hygiene');
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body).toHaveProperty('schemaVersion');
    expect(body).toHaveProperty('results');
    expect(body.results).toHaveProperty('OSAC');

    const project = body.results.OSAC;
    expect(project).toHaveProperty('summary');
    expect(project.summary).toHaveProperty('uniqueIssueCount');
    expect(project.summary).toHaveProperty('totalRuleMatches');
    expect(Array.isArray(project.rules)).toBe(true);
    expect(project.rules.length).toBeGreaterThan(0);
  });

  test('GET project-hygiene config returns the fixture-backed rule catalog', async ({ request }) => {
    const res = await request.get('/api/modules/releases/hygiene/project-hygiene/config');
    expect(res.ok()).toBe(true);
    const body = await res.json();

    expect(body).toHaveProperty('projects');
    expect(body.projects).toHaveProperty('OSAC');
    expect(Array.isArray(body.projects.OSAC.rules)).toBe(true);
    expect(body.projects.OSAC.rules.length).toBeGreaterThan(0);
  });
});

test.describe('Releases — Jira Hygiene Report @jira-hygiene', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Jira Hygiene appears first in the Reports hub and is clickable', async ({ page }) => {
    await page.goto('/#/releases/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const firstCard = page.locator('.grid > *').first();
    await expect(firstCard).toContainText('Jira Hygiene');

    const jiraHygieneCard = page.locator('.cursor-pointer', { hasText: 'Jira Hygiene' });
    await jiraHygieneCard.first().click();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    await expect(page.locator('h2', { hasText: 'Jira Hygiene' })).toBeVisible();
    expect(page.errors).toHaveLength(0);
  });

  test('loads via direct report URL and renders fixture-backed content without errors', async ({ page }) => {
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/releases/hygiene/project-hygiene')) {
        apiRequests.push(request.url());
      }
    });

    await page.goto('/#/releases/reports?report=program-hygiene');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Proves the view actually called the new API route, not the legacy one
    expect(apiRequests.some(url => url.endsWith('/hygiene/project-hygiene'))).toBe(true);
    expect(apiRequests.some(url => url.includes('/program-report'))).toBe(false);

    // Fixture-backed project identity and summary metrics render
    await expect(page.locator('text=OSAC').first()).toBeVisible();
    await expect(page.locator('text=Unique Affected Issues')).toBeVisible();

    // Fixture-backed dynamic rule cards render (from project-hygiene-config/results, not hardcoded).
    // Matches twice (the rule card itself, and the partial-failure banner naming the failed rule) —
    // both are expected, since the fixture's "no-team" rule is the one seeded with count: -1.
    await expect(page.locator('text=Open issue without Team').first()).toBeVisible();

    // Fixture-backed issue row renders in the Issues tab
    await expect(page.locator('text=OSAC-101')).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });
});

test.describe('Releases — Manage Hygiene Rules (read-only) @jira-hygiene', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Hygiene Rules tab is reachable and renders read-only fixture-backed rules', async ({ page }) => {
    await page.goto('/#/releases/registry?tab=hygiene');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Manage requires the planning-manager role — skip gracefully if this
    // test run's user doesn't have it, consistent with the RICE Config API
    // tests above skipping on 403 in unauthenticated CI containers.
    const accessDenied = await page.locator('text=Access Denied').count();
    if (accessDenied > 0) {
      test.skip();
      return;
    }

    await expect(page.locator('text=Open issue without Team')).toBeVisible();

    // Read-only: no save/refresh/toggle/threshold controls
    expect(await page.locator('button', { hasText: 'Save' }).count()).toBe(0);
    expect(await page.locator('input, select').count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });
});
