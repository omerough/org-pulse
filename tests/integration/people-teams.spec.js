const { test, expect } = require('@playwright/test');
const { DEFAULT_PAGE_WAIT_TIME } = require('./constants');
const { setupErrorTracking, logCapturedErrors, pageHasContent, pageLoadComplete, mainContentIsVisible, countDisabledNavItems } = require('./helpers');

/**
 * Integration tests for People & Teams module
 *
 * These tests verify:
 * - Module loads and renders correctly
 * - Data fetching and display works
 * - Navigation within the module functions
 * - API integration is functional
 *
 * Tag: @people-teams
 * Usage: npx playwright test --grep @people-teams
 */

test.describe('People & Teams Module @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should be visible in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Find the People & Teams module in the sidebar
    const moduleNav = page.locator('aside nav').filter({ hasText: 'People & Teams' });
    const count = await moduleNav.count();
    expect(count).toBeGreaterThan(0);

    // Verify the module link is visible and clickable
    const moduleLink = moduleNav.first();
    await expect(moduleLink).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('should navigate to People & Teams module when clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Expand the People & Teams module section if it's collapsed
    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    // Click on the "Team Directory" view (default view)
    const viewLink = page.locator('aside nav button').filter({ hasText: 'Team Directory' }).first();
    await viewLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify URL changed to team-tracker module (default view is home)
    expect(page.url()).toMatch(/team-tracker\/home/);

    // Verify main content is visible
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    expect(page.errors).toHaveLength(0);
  });

  test('should fetch data from People & Teams API endpoints', async ({ page }) => {
    // Monitor network requests
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/team-tracker')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });

    // Navigate to Team Directory (makes API calls for teams and people)
    await page.goto('/#/team-tracker/home');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Verify that API requests were made to the team-tracker endpoints
    // In demo mode, these should still be called and return fixture data
    expect(apiRequests.length).toBeGreaterThan(0);
    console.log(`People & Teams API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url}`);
    });

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Disabled Menu Items
 *
 * Verify that People & Teams has no disabled menu items in the
 * publicly visible navigation (excluding role-gated items).
 */
test.describe('People & Teams Disabled Menu Items @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should have no disabled menu items', async ({ page }) => {
    await page.goto('/#/team-tracker/home');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Count disabled navigation items within the People & Teams section only
    const disabledCount = await countDisabledNavItems(page, 'People & Teams');

    // People & Teams module should have no disabled menu items
    expect(disabledCount).toBe(0);
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Hidden Menu Items
 *
 * Manage and Work Allocation are hidden from nav for the broader engineering
 * rollout (see modules/team-tracker/module.json and
 * modules/team-tracker/client/reports/registry.js) — their underlying views
 * remain in place, just unreachable through nav/the Reports catalog.
 */
test.describe('People & Teams Hidden Menu Items @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Manage is hidden from nav', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const moduleHeader = page.locator('aside nav button').filter({ hasText: 'People & Teams' }).first();
    await moduleHeader.click();
    await page.waitForTimeout(500);

    const manageItem = page.locator('aside nav button').filter({ hasText: 'Manage' });
    expect(await manageItem.count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Work Allocation is hidden from the Reports catalog', async ({ page }) => {
    await page.goto('/#/team-tracker/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const allocationCard = page.locator('.cursor-pointer', { hasText: 'Work Allocation' });
    expect(await allocationCard.count()).toBe(0);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Active Components
 *
 * Verify each major view (aka menu item) in the People & Teams module loads
 * with meaningful content.
 *
 * Note: "My Teams" requires the manager role and is not tested here since
 * demo mode runs unauthenticated. "Manage" is hidden from nav (see the
 * Hidden Menu Items describe block below) and is not part of this loop.
 */
test.describe('People & Teams Views @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  // Helper to navigate and verify a view loads with content
  async function testView(page, viewId, viewName) {
    await page.goto(`/#/team-tracker/${viewId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // Before we verify content, we need to verify the overall view loads
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    // Verify the view has rendered some meaningful content by checking for
    // data-bearing elements (not just empty containers or placeholders)
    const hasContent = await pageHasContent(page);
    expect(hasContent).toBe(true);

    // Verify we're not stuck in an infinite loading state
    const pageHasFinishedLoading = await pageLoadComplete(page);
    expect(pageHasFinishedLoading).toBe(true);
    if (page.errors.length > 0) {
      console.error(`${viewName} errors:`, page.errors);
    }

    expect(page.errors).toHaveLength(0);
  }

  test('should load Team Directory view', async ({ page }) => {
    await testView(page, 'home', 'Team Directory');
  });

  test('should load People view', async ({ page }) => {
    await testView(page, 'people', 'People');
  });

  test('should load Reports view', async ({ page }) => {
    await testView(page, 'reports', 'Reports');
  });

  test('should load Org Dashboard view', async ({ page }) => {
    await testView(page, 'org-dashboard', 'Org Dashboard');
  });
});

/**
 * People Directory
 *
 * Verify the People Directory view shows roster data from fixtures
 */
test.describe('People & Teams People Directory @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('should display people from registry', async ({ page }) => {
    await page.goto('/#/team-tracker/people');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    // The people directory should render a list or table of people
    // from the default (OSAC) canonical roster fixture
    const mainContentVisible = await mainContentIsVisible(page);
    expect(mainContentVisible).toBe(true);

    // Look for name-bearing elements — the fixture data includes
    // names like "Alice Chen", "Bob Smith", etc.
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    const hasNames = bodyText.includes('Alice Chen') || bodyText.includes('Bob Smith');
    expect(hasNames).toBe(true);

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-qualified People & Teams (OSAC-5968)
 *
 * Verifies the Flight Control project roster renders through the normalized
 * read model. OSAC-specific canonical coverage lives in the OSAC describe
 * blocks at the end of this file.
 */
test.describe('People & Teams Project-Qualified Roster @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('Flight Control People Directory renders project-qualified people and navigates by accountId', async ({ page }) => {
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');

    await page.locator('tbody tr', { hasText: 'Nadia Osei' }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain('accountId=fc-acc-1');
    expect(page.url()).not.toContain('uid=');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control People Directory surfaces published GitHub/GitLab identities without exposing managerRef', async ({ page }) => {
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    // Fixture: 2 of 3 flightctl people have a matched GitHub identity (nosei, mliu).
    expect(bodyText).toContain('GitHub IDs');
    expect(bodyText).toContain('GitLab IDs');
    expect(bodyText).not.toContain('fc-acc-2');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control Team Directory navigates to Team Detail', async ({ page }) => {
    await page.goto(`/#/team-tracker/home?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const teamCard = page.locator('.cursor-pointer', { hasText: 'Flight Control Core' }).first();
    await expect(teamCard).toBeVisible();
    await teamCard.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/team-detail/);
    expect(page.url()).toContain(`teamKey=${FLIGHTCTL}`);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Flight Control Core');

    expect(page.errors).toHaveLength(0);
  });

  test('project-qualified Person Detail resolves without the legacy OSAC registry/name fallback', async ({ page }) => {
    const registryRequests = [];
    page.on('request', request => {
      if (request.url().includes('/registry/people/')) registryRequests.push(request.url());
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');
    expect(bodyText).not.toContain('Person not found');
    expect(registryRequests).toHaveLength(0);

    expect(page.errors).toHaveLength(0);
  });

  test('project-qualified Person Profile shows the verified LDAP UID identity badge with a Rover link, distinct from the Jira Account ID', async ({ page }) => {
    // Fixture: fc-acc-1's ldapUid "nosei-ipa" differs from her accountId and GitHub username.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const card = page.locator('[data-tour="person-profile-card"]');
    await expect(card).toBeVisible();

    const identityBadge = card.locator('.font-mono.text-xs');
    await expect(identityBadge).toHaveText('nosei-ipa');
    await expect(identityBadge).toHaveAttribute('title', 'Jira Account ID: fc-acc-1');

    const roverLink = card.locator('a[href="https://rover.redhat.com/people/profile/nosei-ipa"]');
    await expect(roverLink).toBeVisible();

    // The Jira accountId itself is never shown as the visible identity value.
    const cardText = await card.textContent();
    expect(cardText).not.toContain('fc-acc-1');

    expect(page.errors).toHaveLength(0);
  });

  test('project-qualified Person Profile renders physical location distinct from Geo/Region', async ({ page }) => {
    // Fixture: fc-acc-1 has city/country "Cork, IE" and geo "EMEA" as separate published fields.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const card = page.locator('[data-tour="person-profile-card"]');
    const cardText = await card.textContent();

    expect(cardText).toContain('Cork, IE');
    expect(cardText).toContain('EMEA');

    expect(page.errors).toHaveLength(0);
  });

  test('project-qualified Person Profile shows no identity badge, Rover link, or accountId fallback for an unmatched person', async ({ page }) => {
    // Fixture: fc-acc-3 (Priya Shah) is unmatched, so enrichment never populates ldapUid.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-3`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const card = page.locator('[data-tour="person-profile-card"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.font-mono.text-xs')).toHaveCount(0);
    await expect(card.locator('a[href*="rover.redhat.com"]')).toHaveCount(0);

    const cardText = await card.textContent();
    expect(cardText).toContain('Priya Shah');
    expect(cardText).not.toContain('Jira ID');
    expect(cardText).not.toContain('fc-acc-3');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control People Directory shows physical Location distinct from Geo and filters by Geo', async ({ page }) => {
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Cork, IE');
    expect(bodyText).toContain('Raleigh, US');
    expect(bodyText).toContain('EMEA');
    expect(bodyText).toContain('AMER');

    await page.getByRole('checkbox', { name: 'EMEA', exact: true }).check();
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const filteredText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(filteredText).toContain('Nadia Osei');
    expect(filteredText).not.toContain('Marco Liu');

    expect(page.errors).toHaveLength(0);
  });

  test('Flight Control Org Dashboard shows canonical headcount/team totals and hides legacy-only sections', async ({ page }) => {
    await page.goto(`/#/team-tracker/org-dashboard?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();

    // Fixture: 2 published teams, 2 active people (fc-acc-1, fc-acc-2); fc-acc-3 is inactive.
    expect(bodyText).toContain('Flight Control Core');
    expect(bodyText).toContain('Flight Control UI');
    expect(bodyText).not.toContain('Components');
    expect(bodyText).not.toContain('Open PRDs');

    await page.locator('tr', { hasText: 'Flight Control Core' }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/team-detail/);
    expect(page.url()).toContain(`teamKey=${FLIGHTCTL}`);

    expect(page.errors).toHaveLength(0);
  });

  test('OSAC People Directory resolves people by accountId, not legacy uid', async ({ page }) => {
    await page.goto('/#/team-tracker/people');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText.includes('Alice Chen') || bodyText.includes('Bob Smith')).toBe(true);

    await page.locator('tbody tr').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toMatch(/person-detail/);
    expect(page.url()).toContain('accountId=');
    expect(page.url()).not.toContain('uid=');
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-Qualified Manager Dashboard (OSAC-6322)
 *
 * Demo mode's local-dev user is a privileged (admin) identity, not a verified
 * manager, so these tests exercise the admin nav bypass and the honest
 * no-registry-identity empty state rather than a populated purview.
 */
test.describe('People & Teams Manager Dashboard @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('My Teams nav item appears for a privileged user once a Flight Control project is selected', async ({ page }) => {
    await page.goto(`/#/team-tracker/home?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const myTeamsItem = page.locator('aside nav button').filter({ hasText: 'My Teams' });
    await expect(myTeamsItem.first()).toBeVisible();

    expect(page.errors).toHaveLength(0);
  });

  test('Manager Dashboard honestly reports no registry identity for Flight Control', async ({ page }) => {
    await page.goto(`/#/team-tracker/manager-dashboard?projectId=${FLIGHTCTL}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    expect(await pageLoadComplete(page)).toBe(true);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('No Registry Identity');

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-Qualified Jira Person Metrics (OSAC-6322)
 * Verifies the endpoint is wired end to end and never falls back to legacy OSAC metrics.
 */
test.describe('People & Teams Project-Qualified Jira Person Metrics @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('fetches metrics with the correct projectId/accountId and renders the published Jira panels', async ({ page }) => {
    const metricsRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/modules/team-tracker/project-person-metrics')) {
        metricsRequests.push(request.url());
      }
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(metricsRequests).toHaveLength(1);
    const requestUrl = new URL(metricsRequests[0]);
    expect(requestUrl.searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(requestUrl.searchParams.get('accountId')).toBe('fc-acc-1');

    // Fixture: fc-acc-1 (Nadia Osei) has 2 resolved issues, 1 in-progress.
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Resolved Issues');
    expect(bodyText).toContain('FLPATH-101');
    expect(bodyText).toContain('FLPATH-110');

    expect(page.errors).toHaveLength(0);
  });

  test('renders safely when the Jira publication is unavailable, without fabricated counts or console errors', async ({ page }) => {
    await page.route('**/api/modules/team-tracker/project-person-metrics**', route => route.fulfill({
      json: {
        projectId: FLIGHTCTL,
        accountId: 'fc-acc-2',
        availability: 'unavailable',
        reason: 'missing-publication',
        publicationState: null,
        generatedAt: null,
        partial: false,
        metrics: null
      }
    }));

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(await mainContentIsVisible(page)).toBe(true);
    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Marco Liu');
    expect(bodyText).not.toContain('Resolved Issues');
    expect(bodyText).not.toContain('Story Points');

    expect(page.errors).toHaveLength(0);
  });

  test('never falls back to the legacy OSAC per-person Jira metrics endpoint', async ({ page }) => {
    const legacyMetricsRequests = [];
    page.on('request', request => {
      if (/\/api\/modules\/team-tracker\/person\/[^/]+\/metrics/.test(request.url())) {
        legacyMetricsRequests.push(request.url());
      }
    });

    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(legacyMetricsRequests).toHaveLength(0);
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-Qualified Team Delivery (OSAC-6322)
 * Verifies Team Detail > Delivery reads the canonical project-scoped team metrics
 * and never falls back to legacy OSAC metrics.
 */
test.describe('People & Teams Project-Qualified Team Delivery @people-teams', () => {
  const FLIGHTCTL = 'flightctl';
  // Fixture: fixtures/projects/flightctl/sources/jira-person-metrics/registry.json
  const CORE_TEAM_KEY = 'flightctl::366df4de-dc38-4f71-9f0d-9916d450c20c';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  const TEAM_METRICS_URL = /\/api\/(?:modules\/team-tracker\/)?team\/([^/?]+)\/metrics/;
  const LEGACY_METRICS_URL = /\/api\/(?:modules\/team-tracker\/)?(?:people\/metrics|person\/[^/?]+\/metrics)/;

  const card = (page, label) =>
    page.getByText(label, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');

  // The Overview tab stays mounted (hidden) alongside Delivery, so only match visible rows.
  const row = (page, text) => page.locator('tbody tr:visible', { hasText: text });

  async function openCoreDelivery(page) {
    await page.goto(`/#/team-tracker/home?projectId=${FLIGHTCTL}`);
    const teamCard = page.locator('.cursor-pointer', { hasText: 'Flight Control Core' }).first();
    await expect(teamCard).toBeVisible();
    await teamCard.click();
    await page.getByRole('button', { name: 'Delivery' }).click();
  }

  test('Team Directory to Delivery fetches project-scoped metrics and renders the published members and issues', async ({ page }) => {
    const metricsRequests = [];
    const legacyRequests = [];
    page.on('request', request => {
      const url = request.url();
      if (TEAM_METRICS_URL.test(url)) metricsRequests.push(url);
      if (LEGACY_METRICS_URL.test(url)) legacyRequests.push(url);
    });
    const metricsResponse = page.waitForResponse(response => TEAM_METRICS_URL.test(response.url()));

    await openCoreDelivery(page);

    const response = await metricsResponse;
    expect(response.ok()).toBeTruthy();
    const requestUrl = new URL(response.url());
    expect(requestUrl.searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(decodeURIComponent(requestUrl.pathname.match(TEAM_METRICS_URL)[1])).toBe(CORE_TEAM_KEY);

    const metrics = await response.json();
    expect(metrics.teamKey).toBe(CORE_TEAM_KEY);
    expect(metrics.available).toBe(true);
    expect(metrics.aggregate).toMatchObject({ resolvedCount: 3, resolvedPoints: 10, inProgressCount: 1 });
    expect(metrics.members.map(m => m.accountId).sort()).toEqual(['fc-acc-1', 'fc-acc-2']);
    expect(metrics.members.find(m => m.accountId === 'fc-acc-1').metrics).toMatchObject({ lookbackDays: 365, resolvedCount: 2, resolvedPoints: 8, inProgressCount: 1 });
    expect(metrics.members.find(m => m.accountId === 'fc-acc-2').metrics).toMatchObject({ lookbackDays: 365, resolvedCount: 1, resolvedPoints: 2 });
    const attribution = Object.fromEntries(metrics.resolvedIssues.map(i => [i.key, i.accountId]));
    expect(attribution).toEqual({ 'FLPATH-101': 'fc-acc-1', 'FLPATH-102': 'fc-acc-1', 'FLPATH-103': 'fc-acc-2' });
    expect(metrics.inProgressIssues.map(i => [i.key, i.accountId])).toEqual([['FLPATH-110', 'fc-acc-1']]);

    // Aggregate cards render the published values with the consistent published window.
    await expect(card(page, 'Issues Resolved')).toContainText('3');
    await expect(card(page, 'Issues Resolved')).toContainText('Last year');
    await expect(card(page, 'Story Points')).toContainText('10');

    // Member table joins by accountId; Priya Shah belongs to a different team.
    await expect(row(page, 'Nadia Osei')).toBeVisible();
    await expect(row(page, 'Marco Liu')).toBeVisible();
    await expect(row(page, 'Priya Shah')).toHaveCount(0);

    // Issue details resolve the assignee name from accountId.
    await card(page, 'Issues Resolved').click();
    await expect(page.getByRole('heading', { name: /Resolved Issues \(3\)/ })).toBeVisible();
    await expect(row(page, 'FLPATH-101')).toContainText('Nadia Osei');
    await expect(row(page, 'FLPATH-103')).toContainText('Marco Liu');
    await page.locator('div.fixed.inset-0 button').first().click();
    await expect(page.getByRole('heading', { name: /Resolved Issues/ })).toHaveCount(0);

    await card(page, 'In Progress').click();
    await expect(page.getByRole('heading', { name: /In-Progress Issues \(1\)/ })).toBeVisible();
    await expect(row(page, 'FLPATH-110')).toContainText('Nadia Osei');

    // Never the legacy OSAC endpoints, and every team-metrics call is project-scoped.
    expect(legacyRequests).toHaveLength(0);
    expect(metricsRequests.length).toBeGreaterThan(0);
    for (const url of metricsRequests) {
      expect(new URL(url).searchParams.get('projectId')).toBe(FLIGHTCTL);
    }
    expect(page.errors).toHaveLength(0);
  });

  test('omits the window subtitle when the published members report mixed lookback windows', async ({ page }) => {
    await page.route(TEAM_METRICS_URL, async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.members[0].metrics.lookbackDays = 90;
      await route.fulfill({ response, json: body });
    });

    await openCoreDelivery(page);

    await expect(card(page, 'Issues Resolved')).toContainText('3');
    await expect(card(page, 'Issues Resolved')).not.toContainText('Last year');
    await expect(card(page, 'Issues Resolved')).not.toContainText('90');
    expect(page.errors).toHaveLength(0);
  });
});

test.describe('People & Teams Project-Qualified Contributions @people-teams', () => {
  const FLIGHTCTL = 'flightctl';

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('project-qualified Person Profile loads GitHub contributions from the canonical artifact, attributed by (projectId, accountId)', async ({ page }) => {
    // Fixture: fixtures/projects/flightctl/sources/contributions/registry.json.
    // 214/97 don't appear in the legacy github-contributions.json fixture.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    let bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Nadia Osei');
    expect(bodyText).toContain('GitHub Contributions');
    expect(bodyText).toContain('214');

    // A different accountId in the same project attributes its own count, not fc-acc-1's.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-2`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Marco Liu');
    expect(bodyText).toContain('97');
    expect(bodyText).not.toContain('214');

    expect(page.errors).toHaveLength(0);
  });

  test('does not fabricate a contribution count for a person with no resolved GitHub identity', async ({ page }) => {
    // Fixture: fc-acc-3 (Priya Shah) has no identities.github entry, so the
    // publication reports her unresolved (github: null), never a zero.
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-3`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    const bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('Priya Shah');
    expect(bodyText).not.toContain('214');
    expect(bodyText).not.toContain('97');

    expect(page.errors).toHaveLength(0);
  });

  test('switching the project context resets contributions instead of retaining the prior project\'s data', async ({ page }) => {
    await page.goto(`/#/team-tracker/person-detail?projectId=${FLIGHTCTL}&accountId=fc-acc-1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    let bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).toContain('214');

    // Switch projects via the shell's in-app selector: no full page reload.
    const projectSelector = page.locator('#project-selector');
    await expect(projectSelector).toBeVisible();
    await projectSelector.selectOption('osac');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);

    expect(page.url()).toContain('projectId=osac');
    bodyText = await page.locator('main, [role="main"], .min-h-screen').first().textContent();
    expect(bodyText).not.toContain('214');
    expect(bodyText).not.toContain('Nadia Osei');

    expect(page.errors).toHaveLength(0);
  });
});

/**
 * Project-Qualified Trends and Team Comparison (OSAC-6322)
 * Verifies the report journeys read project-scoped GitHub/Jira data, present
 * unavailable and partial coverage accurately, for both published projects.
 */
test.describe('People & Teams Project-Qualified Reports @people-teams', () => {
  const FLIGHTCTL = 'flightctl';
  // Fixture: fixtures/projects/flightctl/sources/contributions/registry.json
  const CORE_KEY = 'flightctl::366df4de-dc38-4f71-9f0d-9916d450c20c';
  const UI_KEY = 'flightctl::73ce1d26-43fc-4432-92eb-ce48c5e5e200';
  const TRENDS_URL = /\/api\/(?:modules\/team-tracker\/)?trends(?:\?|$)/;
  const TEAM_METRICS_URL = /\/api\/(?:modules\/team-tracker\/)?team\/([^/?]+)\/metrics/;

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  async function openReport(page, title, projectId) {
    await page.goto(projectId ? `/#/team-tracker/reports?projectId=${projectId}` : '/#/team-tracker/reports');
    await page.locator('.cursor-pointer', { hasText: title }).first().click();
  }

  test('Trends reads the project-scoped GitHub series and charts it alongside Jira', async ({ page }) => {
    const trendsUrls = [];
    page.on('request', request => {
      if (TRENDS_URL.test(request.url())) trendsUrls.push(request.url());
    });
    const trendsResponse = page.waitForResponse(response => TRENDS_URL.test(response.url()));

    await openReport(page, 'Productivity Trends', FLIGHTCTL);

    const response = await trendsResponse;
    expect(new URL(response.url()).searchParams.get('projectId')).toBe(FLIGHTCTL);
    const trends = await response.json();
    expect(trends.github.overall).toEqual({ '2026-08': 110, '2026-09': 119, '2026-10': 82 });
    expect(trends.github.byTeam[CORE_KEY]).toEqual({ '2026-08': 110, '2026-09': 119, '2026-10': 82 });
    expect(trends.github.byTeam[UI_KEY]).toEqual({ '2026-08': 40, '2026-09': 31, '2026-10': 26 });

    // Issues Resolved, GitHub, and Avg Cycle Time render; GitLab is explicitly unsupported.
    await expect(page.locator('canvas')).toHaveCount(3);
    await expect(page.getByText('GitLab Contributions: Unsupported for this project.')).toBeVisible();
    await expect(page.getByText('GitHub Contributions: not published for this project.')).toHaveCount(0);

    // Selecting a team re-slices the loaded series without leaving project scope.
    await page.getByRole('group', { name: 'Team filter' }).getByText('Flight Control UI').click();
    await expect(page.locator('canvas')).toHaveCount(3);

    expect(trendsUrls.length).toBeGreaterThan(0);
    for (const url of trendsUrls) {
      expect(new URL(url).searchParams.get('projectId')).toBe(FLIGHTCTL);
    }
    expect(page.errors).toHaveLength(0);
  });

  test('Trends reports GitHub as not published, not a zero series, when no monthly measurements exist', async ({ page }) => {
    await page.route(TRENDS_URL, async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.github = { availability: 'available', partial: false, generatedAt: body.github.generatedAt, overall: {}, byTeam: {} };
      await route.fulfill({ response, json: body });
    });

    await openReport(page, 'Productivity Trends', FLIGHTCTL);

    await expect(page.getByText('GitHub Contributions: not published for this project.')).toBeVisible();
    // Only Issues Resolved and Avg Cycle Time are charted.
    await expect(page.locator('canvas')).toHaveCount(2);
    expect(page.errors).toHaveLength(0);
  });

  test('Team Comparison scopes metrics to the project and labels partial GitHub coverage', async ({ page }) => {
    const metricsUrls = [];
    page.on('request', request => {
      if (TEAM_METRICS_URL.test(request.url())) metricsUrls.push(request.url());
    });

    await openReport(page, 'Team Comparison', FLIGHTCTL);

    const teamFilter = page.getByRole('group', { name: 'Team filter' });
    await teamFilter.getByText('Flight Control Core').click();
    await teamFilter.getByText('Flight Control UI').click();
    await page.getByLabel('GitHub Contributions (1yr)').check();
    await page.getByLabel('Avg GitHub Contributions per Member (1yr)').check();
    await expect(page.getByLabel('GitLab Contributions (1yr)')).toBeDisabled();

    const responses = Promise.all([CORE_KEY, UI_KEY].map(key =>
      page.waitForResponse(response => {
        const match = response.url().match(TEAM_METRICS_URL);
        return match && decodeURIComponent(match[1]) === key;
      })
    ));
    await page.getByRole('button', { name: 'Run' }).click();

    const [coreResponse, uiResponse] = await responses;
    const core = await coreResponse.json();
    const ui = await uiResponse.json();
    expect(new URL(coreResponse.url()).searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(new URL(uiResponse.url()).searchParams.get('projectId')).toBe(FLIGHTCTL);
    expect(core.aggregate.github).toMatchObject({ total: 311, memberCount: 2, contributorCount: 2 });
    expect(ui.aggregate.github).toMatchObject({ total: 97, memberCount: 2, contributorCount: 1 });

    // Only the team with an unmeasured member is flagged; the complete team is not.
    await expect(page.locator('canvas')).toHaveCount(2);
    await expect(page.getByText('Partial coverage, totals cover measured members only: Flight Control UI (1 of 2 members)')).toBeVisible();
    await expect(page.getByText('Partial coverage, averaged over measured members only: Flight Control UI (1 of 2 members)')).toBeVisible();
    await expect(page.getByText(/Partial coverage.*Flight Control Core/)).toHaveCount(0);

    for (const url of metricsUrls) {
      expect(new URL(url).searchParams.get('projectId')).toBe(FLIGHTCTL);
    }
    expect(page.errors).toHaveLength(0);
  });

  test('OSAC Trends and Team Comparison read the canonical project-scoped series with GitLab unsupported', async ({ page }) => {
    const trendsResponse = page.waitForResponse(response => TRENDS_URL.test(response.url()));
    await openReport(page, 'Productivity Trends');

    const response = await trendsResponse;
    expect(new URL(response.url()).searchParams.get('projectId')).toBe('osac');
    const trends = await response.json();
    expect(trends.github).toHaveProperty('overall');
    expect(trends.github).not.toHaveProperty('users');
    expect(Object.keys(trends.github.byTeam).every(key => key.startsWith('osac::'))).toBe(true);
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText('GitLab Contributions: Unsupported for this project.')).toBeVisible();

    const metricsUrls = [];
    page.on('request', request => {
      if (TEAM_METRICS_URL.test(request.url())) metricsUrls.push(request.url());
    });
    await openReport(page, 'Team Comparison');
    await expect(page.getByLabel('GitLab Contributions (1yr)')).toBeDisabled();

    const teamFilter = page.getByRole('group', { name: 'Team filter' });
    await teamFilter.getByText('Platform', { exact: true }).click();
    await page.getByLabel('GitHub Contributions (1yr)').check();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);

    expect(metricsUrls.length).toBeGreaterThan(0);
    for (const url of metricsUrls) {
      expect(new URL(url).searchParams.get('projectId')).toBe('osac');
    }
    expect(page.errors).toHaveLength(0);
  });
});

/**
 * OSAC Canonical People & Teams (OSAC-6323)
 * OSAC uses the read-only project-qualified path; requests without projectId stay legacy.
 */
const OSAC = 'osac';
const FLIGHTCTL_PROJECT = 'flightctl';
const OSAC_PLATFORM_KEY = 'osac::93eb6d97-b6c6-4509-ab08-16478cd02304';
const FORWARDED_EMAIL = 'X-Forwarded-Email';

const ROSTER_URL = /\/api\/(?:modules\/team-tracker\/)?roster(?:\?|$)/;
const TEAM_METRICS_PATH = /\/api\/(?:modules\/team-tracker\/)?team\/([^/?]+)\/metrics/;
const MESSAGES_URL = /\/api\/messages(?:\?|$)/;
const LEGACY_ENDPOINT = /\/api\/(?:modules\/team-tracker\/)?(?:registry\/|structure\/(?:teams|unassigned)|people\/metrics|person\/[^/?]+\/metrics)/;
const LEGACY_LINK_PARAM = /[?&](?:uid|person)=/;
const TEAM_TRACKER_API = '/api/modules/team-tracker';

const mainContent = page => page.locator('main, [role="main"], .min-h-screen').first();

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(DEFAULT_PAGE_WAIT_TIME);
}

function trackRequests(page, pattern) {
  const urls = [];
  page.on('request', request => {
    if (pattern.test(request.url())) urls.push(request.url());
  });
  return urls;
}

function expectAllProjectQualified(urls, projectId) {
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(new URL(url).searchParams.get('projectId')).toBe(projectId);
  }
}

const editControls = page => page.locator('button[title="Edit"], button[title="Set"]');
const destructiveControls = page => page.getByRole('button', { name: /^(Delete|Reactivate|Save)/ });

test.describe('People & Teams OSAC Canonical Roster @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('People Directory reads only the project-qualified roster and navigates by accountId', async ({ page }) => {
    const rosterUrls = trackRequests(page, ROSTER_URL);
    const legacyUrls = trackRequests(page, LEGACY_ENDPOINT);

    await page.goto(`/#/team-tracker/people?projectId=${OSAC}`);
    await settle(page);

    const bodyText = await mainContent(page).textContent();
    expect(bodyText).toContain('Alice Chen');
    expect(bodyText).toContain('Sam Designer');
    expectAllProjectQualified(rosterUrls, OSAC);
    expect(legacyUrls).toHaveLength(0);

    await page.locator('tbody tr', { hasText: 'Bob Smith' }).first().click();
    await settle(page);
    expect(page.url()).toContain('accountId=osac-acc-2');
    expect(page.url()).not.toMatch(LEGACY_LINK_PARAM);

    expect(page.errors).toHaveLength(0);
  });

  test('Team Directory lists the published teams and opens Team Detail by canonical key', async ({ page }) => {
    await page.goto(`/#/team-tracker/home?projectId=${OSAC}`);
    await settle(page);

    const teamCard = page.locator('.cursor-pointer', { hasText: 'ML Platform' }).first();
    await expect(teamCard).toBeVisible();
    await teamCard.click();
    await settle(page);

    expect(page.url()).toMatch(/team-detail/);
    expect(decodeURIComponent(page.url())).toContain('teamKey=osac::b29325e5-601a-4d53-b84b-0170920db548');
    await expect(mainContent(page)).toContainText('Grace Kim');

    expect(page.errors).toHaveLength(0);
  });

  test('Person Profile is read-only and shows the verified LDAP identity', async ({ page }) => {
    const legacyUrls = trackRequests(page, LEGACY_ENDPOINT);

    await page.goto(`/#/team-tracker/person-detail?projectId=${OSAC}&accountId=osac-acc-1`);
    await settle(page);

    const card = page.locator('[data-tour="person-profile-card"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Alice Chen');
    await expect(card.locator('.font-mono.text-xs')).toHaveText('achen');
    await expect(editControls(page)).toHaveCount(0);
    await expect(destructiveControls(page)).toHaveCount(0);
    expect(legacyUrls).toHaveLength(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Team Detail is read-only for the OSAC project', async ({ page }) => {
    await page.goto(`/#/team-tracker/team-detail?projectId=${OSAC}&teamKey=${OSAC_PLATFORM_KEY}`);
    await settle(page);

    await expect(mainContent(page)).toContainText('Bob Smith');
    await expect(editControls(page)).toHaveCount(0);
    await expect(destructiveControls(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add Member|Edit Team|Delete Team/ })).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });

  test('Org Dashboard totals come from the canonical roster', async ({ page }) => {
    await page.goto(`/#/team-tracker/org-dashboard?projectId=${OSAC}`);
    await settle(page);

    const bodyText = await mainContent(page).textContent();
    for (const team of ['Platform', 'Infrastructure', 'ML Platform', 'Data Pipeline']) {
      expect(bodyText).toContain(team);
    }
    expect(bodyText).not.toContain('Open PRDs');

    expect(page.errors).toHaveLength(0);
  });
});

test.describe('People & Teams OSAC Legacy Deep Links @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  const personLinks = [
    { title: 'a roster uid', query: 'uid=bsmith', canonical: 'accountId=osac-acc-2', name: 'Bob Smith' },
    { title: 'a display name', query: 'person=Carol%20Williams', canonical: 'accountId=osac-acc-3', name: 'Carol Williams' },
    { title: 'an external manager uid', query: 'uid=demovp', canonical: 'ldapUid=demovp', name: 'Demo VP' },
  ];

  for (const { title, query, canonical, name } of personLinks) {
    test(`legacy person link with ${title} is rewritten to the canonical identity`, async ({ page }) => {
      const legacyUrls = trackRequests(page, LEGACY_ENDPOINT);

      await page.goto(`/#/team-tracker/person-detail?projectId=${OSAC}&${query}`);
      await settle(page);

      await expect.poll(() => page.url()).toContain(canonical);
      expect(page.url()).not.toMatch(LEGACY_LINK_PARAM);
      await expect(mainContent(page)).toContainText(name);
      await expect(page.getByTestId('link-unresolved')).toHaveCount(0);
      await expect(editControls(page)).toHaveCount(0);
      await expect(destructiveControls(page)).toHaveCount(0);
      expect(legacyUrls).toHaveLength(0);

      expect(page.errors).toHaveLength(0);
    });
  }

  test('an unmatched legacy person link shows the unresolved state and leaves the URL alone', async ({ page }) => {
    const legacyUrls = trackRequests(page, LEGACY_ENDPOINT);

    await page.goto(`/#/team-tracker/person-detail?projectId=${OSAC}&uid=ghost`);
    await settle(page);

    await expect(page.getByTestId('link-unresolved')).toBeVisible();
    expect(page.url()).toContain('uid=ghost');
    expect(page.url()).not.toContain('accountId=');
    await expect(editControls(page)).toHaveCount(0);
    expect(legacyUrls).toHaveLength(0);

    expect(page.errors).toHaveLength(0);
  });

  test('legacy team link osac::<TeamName> is rewritten to the canonical team key', async ({ page }) => {
    const metricsUrls = trackRequests(page, TEAM_METRICS_PATH);
    const metricsResponse = page.waitForResponse(response =>
      TEAM_METRICS_PATH.test(response.url())
      && decodeURIComponent(response.url().match(TEAM_METRICS_PATH)[1]) === OSAC_PLATFORM_KEY);

    await page.goto(`/#/team-tracker/team-detail?projectId=${OSAC}&teamKey=osac::Platform`);
    await expect.poll(() => decodeURIComponent(page.url())).toContain(`teamKey=${OSAC_PLATFORM_KEY}`);
    await expect(mainContent(page)).toContainText('Alice Chen');
    await page.getByRole('button', { name: 'Delivery' }).click();

    const response = await metricsResponse;
    expect(response.ok()).toBeTruthy();
    expect(new URL(response.url()).searchParams.get('projectId')).toBe(OSAC);
    for (const url of metricsUrls) {
      expect(decodeURIComponent(url.match(TEAM_METRICS_PATH)[1])).not.toBe('osac::Platform');
    }

    expect(page.errors).toHaveLength(0);
  });

  test('unmatched and foreign-prefixed legacy team links show the not-found state without a metrics call', async ({ page }) => {
    const metricsUrls = trackRequests(page, TEAM_METRICS_PATH);

    for (const teamKey of ['osac::Nonexistent', 'achen::Platform']) {
      await page.goto(`/#/team-tracker/team-detail?projectId=${OSAC}&teamKey=${teamKey}`);
      await settle(page);
      await expect(page.getByTestId('team-not-found')).toBeVisible();
    }
    expect(metricsUrls).toHaveLength(0);

    expect(page.errors).toHaveLength(0);
  });

  for (const viewId of ['manage', 'org-explorer', 'unassigned']) {
    test(`${viewId} shows the project-roster guard and makes no legacy fetch`, async ({ page }) => {
      const legacyUrls = trackRequests(page, LEGACY_ENDPOINT);

      await page.goto(`/#/team-tracker/${viewId}?projectId=${OSAC}`);
      await settle(page);

      await expect(page.getByTestId('not-available-for-project')).toContainText('Not available for project rosters.');
      expect(legacyUrls).toHaveLength(0);

      expect(page.errors).toHaveLength(0);
    });
  }
});

test.describe('People & Teams OSAC Project Switching @people-teams', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('switching between OSAC and Flight Control never shows the other project\'s people', async ({ page }) => {
    const rosterUrls = trackRequests(page, ROSTER_URL);

    await page.goto(`/#/team-tracker/people?projectId=${OSAC}`);
    await settle(page);
    await expect(mainContent(page)).toContainText('Alice Chen');
    await expect(mainContent(page)).not.toContainText('Nadia Osei');

    await page.locator('#project-selector').selectOption(FLIGHTCTL_PROJECT);
    await page.goto(`/#/team-tracker/people?projectId=${FLIGHTCTL_PROJECT}`);
    await settle(page);
    await expect(mainContent(page)).toContainText('Nadia Osei');
    await expect(mainContent(page)).not.toContainText('Alice Chen');

    await page.locator('#project-selector').selectOption(OSAC);
    await page.goto(`/#/team-tracker/people?projectId=${OSAC}`);
    await settle(page);
    await expect(mainContent(page)).toContainText('Alice Chen');
    await expect(mainContent(page)).not.toContainText('Nadia Osei');

    const projects = new Set(rosterUrls.map(url => new URL(url).searchParams.get('projectId')));
    expect(projects).toEqual(new Set([OSAC, FLIGHTCTL_PROJECT]));

    expect(page.errors).toHaveLength(0);
  });

  test('field-completeness messages are requested per selected project', async ({ page }) => {
    const messageUrls = trackRequests(page, MESSAGES_URL);

    await page.goto(`/#/team-tracker/home?projectId=${OSAC}`);
    await settle(page);
    expect(messageUrls.length).toBeGreaterThan(0);
    for (const url of messageUrls) {
      expect(new URL(url).searchParams.get('projectId')).toBe(OSAC);
    }
    await expect(page.locator('a[href*="team-tracker/manage"]')).toHaveCount(0);

    messageUrls.length = 0;
    await page.locator('#project-selector').selectOption(FLIGHTCTL_PROJECT);
    await settle(page);
    expect(messageUrls.length).toBeGreaterThan(0);
    expect(new URL(messageUrls[messageUrls.length - 1]).searchParams.get('projectId')).toBe(FLIGHTCTL_PROJECT);
    await expect(page.locator('a[href*="team-tracker/manage"]')).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });
});

test.describe('People & Teams OSAC External Manager @people-teams', () => {
  test.use({ extraHTTPHeaders: { [FORWARDED_EMAIL]: 'demovp@cluster.local' } });

  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('an external manager sees external and indirect reports and opens them by ldapUid', async ({ page }) => {
    await page.goto(`/#/team-tracker/manager-dashboard?projectId=${OSAC}`);
    await settle(page);

    const table = page.locator('tbody:visible');
    await expect(table.getByRole('button', { name: 'Alice Chen' })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Frank Johnson' })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Dana PMLeader' })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Pat Manager' })).toHaveCount(0);

    await page.getByRole('switch').click();
    await expect(table.getByRole('button', { name: 'Pat Manager' })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Bob Smith' })).toBeVisible();

    await table.getByRole('button', { name: 'Dana PMLeader' }).click();
    await expect.poll(() => page.url()).toContain('ldapUid=pmleader');
    await expect(mainContent(page)).toContainText('Dana PMLeader');

    expect(page.errors).toHaveLength(0);
  });

  test('manager state does not leak into Flight Control after switching projects', async ({ page }) => {
    await page.goto(`/#/team-tracker/manager-dashboard?projectId=${OSAC}`);
    await settle(page);
    await expect(mainContent(page)).toContainText('Dana PMLeader');
    await expect(page.locator('aside nav button').filter({ hasText: 'My Teams' }).first()).toBeVisible();

    await page.locator('#project-selector').selectOption(FLIGHTCTL_PROJECT);
    await page.goto(`/#/team-tracker/manager-dashboard?projectId=${FLIGHTCTL_PROJECT}`);
    await settle(page);

    const bodyText = await mainContent(page).textContent();
    expect(bodyText).toContain('No Registry Identity');
    for (const osacName of ['Alice Chen', 'Frank Johnson', 'Dana PMLeader']) {
      expect(bodyText).not.toContain(osacName);
    }
    await expect(page.locator('aside nav button').filter({ hasText: 'My Teams' })).toHaveCount(0);

    expect(page.errors).toHaveLength(0);
  });
});

test.describe('People & Teams OSAC Canonical API @people-teams', () => {
  const get = (request, path, headers = {}) => request.get(`${TEAM_TRACKER_API}${path}`, { headers });
  const forwarded = email => ({ [FORWARDED_EMAIL]: email });

  test('requests without projectId keep the legacy response shapes', async ({ request }) => {
    const roster = await (await get(request, '/roster')).json();
    expect(Array.isArray(roster.orgs)).toBe(true);
    expect(roster).not.toHaveProperty('availability');
    expect(roster).not.toHaveProperty('people');
    const [firstPerson] = Object.values(roster.orgs[0].teams)[0].members;
    expect(firstPerson).toHaveProperty('uid');
    expect(firstPerson).not.toHaveProperty('accountId');

    const permissions = await (await get(request, '/permissions/me')).json();
    expect(Object.keys(permissions).sort()).toEqual(['email', 'isManager', 'managedUids', 'roles', 'uid']);

    const dashboard = await (await get(request, '/manager/dashboard')).json();
    expect(dashboard).not.toHaveProperty('mode');
    expect(dashboard).not.toHaveProperty('availability');

    const trends = await (await get(request, '/trends')).json();
    expect(trends.github).toHaveProperty('users');
    expect(trends.github).not.toHaveProperty('overall');
  });

  test('projectId=osac serves the canonical roster, never the legacy one', async ({ request }) => {
    const response = await get(request, `/roster?projectId=${OSAC}`);
    expect(response.status()).toBe(200);
    const roster = await response.json();
    expect(roster).toMatchObject({ projectId: OSAC, availability: 'available' });
    expect(roster).not.toHaveProperty('orgs');
    expect(roster.people).toHaveLength(12);
    expect(roster.teams.map(team => team.displayName).sort()).toEqual(['Data Pipeline', 'Infrastructure', 'ML Platform', 'Platform']);
    expect(roster.people.every(person => person.key.startsWith('osac::') && !('uid' in person))).toBe(true);

    const trends = await (await get(request, `/trends?projectId=${OSAC}`)).json();
    expect(trends).toMatchObject({ projectId: OSAC, availability: 'available' });
    expect(trends.github).toHaveProperty('overall');
  });

  test('team metrics resolve canonical keys only; a legacy team name is not found', async ({ request }) => {
    const canonical = await get(request, `/team/${encodeURIComponent(OSAC_PLATFORM_KEY)}/metrics?projectId=${OSAC}`);
    expect(canonical.status()).toBe(200);
    expect(await canonical.json()).toMatchObject({ teamKey: OSAC_PLATFORM_KEY, available: true });

    const legacyName = await get(request, `/team/${encodeURIComponent('osac::Platform')}/metrics?projectId=${OSAC}`);
    expect(legacyName.status()).toBe(404);
  });

  test('an unknown project is rejected rather than served from the legacy registry', async ({ request }) => {
    for (const path of ['/roster', '/trends', '/permissions/me', '/manager/dashboard']) {
      const response = await get(request, `${path}?projectId=no-such-project`);
      expect(response.status(), path).toBe(404);
    }
  });

  const managerIdentities = [
    { title: 'an external manager by local part', email: 'demovp@cluster.local', uid: null, ldapUid: 'demovp', managed: ['osac-acc-1', 'osac-acc-6', 'ldap:pmleader'] },
    { title: 'an external manager of an external manager', email: 'pmleader@redhat.com', uid: null, ldapUid: 'pmleader', managed: ['osac-acc-11', 'osac-acc-12'] },
    { title: 'a roster manager by exact email', email: 'bsmith@example.com', uid: 'osac-acc-2', ldapUid: null, managed: ['osac-acc-3'] },
    { title: 'a roster manager by local part', email: 'bsmith@cluster.local', uid: 'osac-acc-2', ldapUid: null, managed: ['osac-acc-3'] },
  ];

  for (const { title, email, uid, ldapUid, managed } of managerIdentities) {
    test(`resolves ${title}`, async ({ request }) => {
      const permissions = await (await get(request, `/permissions/me?projectId=${OSAC}`, forwarded(email))).json();
      expect(permissions).toMatchObject({ email, uid, ldapUid, isManager: true });
      expect([...permissions.managedUids].sort()).toEqual([...managed].sort());

      const dashboard = await get(request, `/manager/dashboard?projectId=${OSAC}`, forwarded(email));
      expect(dashboard.status()).toBe(200);
      expect((await dashboard.json()).directReports.length).toBe(managed.length);
    });
  }

  test('a roster member who manages nobody gets 403 and an unknown identity gets the empty state', async ({ request }) => {
    const nonManager = await get(request, `/manager/dashboard?projectId=${OSAC}`, forwarded('cwilliams@example.com'));
    expect(nonManager.status()).toBe(403);

    const unknown = await get(request, `/manager/dashboard?projectId=${OSAC}`, forwarded('nobody@redhat.com'));
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toMatchObject({ reason: 'no-registry-identity', directReports: [] });
  });

  test('an OSAC manager identity grants nothing in Flight Control', async ({ request }) => {
    const permissions = await (await get(request, `/permissions/me?projectId=${FLIGHTCTL_PROJECT}`, forwarded('demovp@cluster.local'))).json();
    expect(permissions).toMatchObject({ uid: null, ldapUid: null, isManager: false, managedUids: [] });

    const dashboard = await get(request, `/manager/dashboard?projectId=${FLIGHTCTL_PROJECT}`, forwarded('demovp@cluster.local'));
    expect((await dashboard.json()).directReports).toEqual([]);
  });

  test('messages accept a project selection and suppress legacy field-completeness for it', async ({ request }) => {
    const unqualified = await request.get('/api/messages');
    expect(unqualified.status()).toBe(200);
    expect(Array.isArray((await unqualified.json()).messages)).toBe(true);

    const qualified = await request.get(`/api/messages?projectId=${OSAC}`);
    expect(qualified.status()).toBe(200);
    const { messages } = await qualified.json();
    expect(JSON.stringify(messages)).not.toContain('team-tracker/manage');
  });
});
