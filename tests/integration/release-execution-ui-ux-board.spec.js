const { test, expect } = require('@playwright/test');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * UI/UX by Component flow. Projects, roster, registry and Execute features are mocked
 * (demo data has no OSAC UI/UX evidence); other requests reach the demo backend.
 *
 * Tag: @releases
 */

const TAB_URL = '/#/releases/execute?tab=ui-epics-by-component';

function isoDay(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// GA dates are relative to today so the default release stays the next upcoming one.
const REGISTRY_RELEASES = [
  { id: 'fx-1.0', displayName: 'OSAC 1.0', fixVersions: ['1.0'], state: 'active', milestones: { ga: isoDay(-30) } },
  { id: 'fx-1.1', displayName: 'OSAC 1.1', fixVersions: ['1.1'], state: 'active', milestones: { ga: isoDay(30) } },
  { id: 'fx-1.2', displayName: 'OSAC 1.2', fixVersions: ['1.2'], state: 'active', milestones: { ga: isoDay(60) } }
];

// One UIX source Epic per Feature; the Epic mirrors the Feature's status unless overridden.
// Default Epic keys must not contain the Feature key, or a Feature-key search would also match the Epic.
function source(epicKey, overrides = {}) {
  return {
    epicKey, epicType: 'uix', fixVersions: ['1.1'], components: [], localStatus: 'in-progress',
    stageLabels: [], routingLabels: [], status: 'Closed', assignee: null, priority: 'Undefined',
    resolution: null, ...overrides
  };
}

function feature(key, { status = 'Closed', components = [], fixVersions = ['1.1'], labels = [], resolution = null,
  assignee = null, sources, ui = 'in-progress', ux = 'in-progress', enclaveOnly = false } = {}) {
  const epics = sources || [source(key.replace('OSAC-', 'OSAC-E'), { status, fixVersions })];
  const evidence = (value, extra = {}) => ({ status: value, conflict: false, scopes: [], sources: epics, ...extra });
  return {
    key, summary: `${key} summary`, status, statusCategory: 'In Progress', resolution, priority: 'Normal',
    assignee, fixVersions, components, labels, team: null, coverage: null,
    uiEvidence: evidence(ui, { enclaveOnly }), uxEvidence: evidence(ux)
  };
}

const storageFeatures = Array.from({ length: 12 }, (_, i) => feature(`OSAC-31${String(i + 1).padStart(2, '0')}`, {
  components: ['Storage'],
  status: i === 0 ? 'In Progress' : i < 6 ? 'Closed' : 'Backlog'
}));

const FEATURES = [
  ...storageFeatures,
  feature('OSAC-3201', {
    status: 'In Progress', components: ['CaaS', 'Core'],
    sources: [source('OSAC-3211', { status: 'In Progress', assignee: 'Ilya Skornyakov', components: ['CaaS', 'Core'] })]
  }),
  feature('OSAC-3301', { status: 'Backlog', components: ['BMaaS'], labels: ['customer:telus'], ux: 'design' }),
  feature('OSAC-3401', { components: ['Enclave'], enclaveOnly: true, ui: 'not-started' }),
  // Unscheduled, and in Other because nothing names a panel.
  feature('OSAC-3501', { fixVersions: [], components: [] }),
  // Not on the board: no-ui (listed under Not shown), and no UI/UX Epic.
  feature('OSAC-3901', { components: ['Core'], ui: 'not-applicable' }),
  feature('OSAC-3904', { components: ['Storage'], sources: [] }),
  // Listed under Not shown: non-delivery resolution, only no-work Epics.
  feature('OSAC-3903', { components: ['Storage'], resolution: 'Duplicate' }),
  feature('OSAC-3902', {
    components: ['Storage'], sources: [source('OSAC-3912', { resolution: "Won't Do" })]
  }),
  // Another release.
  feature('OSAC-2101', { components: ['VMaaS'], fixVersions: ['1.0'] }),
  feature('OSAC-2102', { components: ['VMaaS'], fixVersions: ['1.0'] }),
  feature('OSAC-2103', { components: ['Core'], fixVersions: ['1.0'] })
];

// Publishing only OSAC puts the shell in single-project mode, where OSAC is the default project.
function installApi(page, { projects = [{ projectId: 'osac', displayName: 'OSAC' }] } = {}) {
  const requests = [];
  page.route('**/api/projects', route => route.fulfill({ json: { projects } }));
  page.route('**/api/roster?**', route => {
    const projectId = new URL(route.request().url()).searchParams.get('projectId');
    return route.fulfill({ json: { projectId, availability: 'available', orgs: [], people: [] } });
  });
  page.route('**/api/modules/releases/registry**', route => {
    requests.push(route.request().url());
    return route.fulfill({ json: { releases: REGISTRY_RELEASES } });
  });
  page.route('**/api/modules/releases/execution/features', route => fulfillFeatures(route, requests));
  page.route('**/api/modules/releases/execution/features?**', route => fulfillFeatures(route, requests));
  return requests;
}

function fulfillFeatures(route, requests) {
  requests.push(route.request().url());
  return route.fulfill({
    json: {
      state: 'supported', fetchedAt: '2026-10-26T10:33:00Z', featureCount: FEATURES.length,
      totalFeatureCount: FEATURES.length, features: FEATURES
    }
  });
}

const releaseSelect = page => page.locator('#ui-ux-board-release');
const panel = (page, name) => page.locator(`[data-panel="${name}"]`);
const panelCards = (page, name) => panel(page, name).locator('[data-testid="feature-card"]');
const summary = page => page.locator('[data-testid="summary-counts"]');
const heading = page => page.getByRole('heading', { name: 'UI/UX by Component' });

async function openDashboard(page, url = TAB_URL) {
  await page.goto(url);
  await expect(page.locator('[data-panel]')).toHaveCount(10);
}

async function chooseFilterOption(page, triggerName, optionName) {
  await page.getByRole('button', { name: triggerName }).click();
  await page.getByRole('checkbox', { name: optionName, exact: true }).check();
  await heading(page).click();
}

test.describe('Releases UI/UX by Component @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('defaults to the next GA release and renders the expected Component panels and cards', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await expect(releaseSelect(page)).toHaveValue('1.1');
    await expect(releaseSelect(page).locator('option')).toHaveText(['1.0', '1.1', 'Unscheduled']);
    await expect(page).toHaveURL(/release=1\.1/);
    await expect(page.getByText('One card per Feature with UI/UX work')).toBeVisible();

    await expect(summary(page)).toHaveText('15 Features · 16 rows');
    await expect(panelCards(page, 'Storage')).toHaveCount(10);
    await expect(panelCards(page, 'CaaS')).toHaveCount(1);
    await expect(panelCards(page, 'BMaaS')).toHaveCount(1);
    await expect(panelCards(page, 'Enclave')).toHaveCount(1);
    await expect(panelCards(page, 'Observability')).toHaveCount(0);
    await expect(panelCards(page, 'Other')).toHaveCount(0);

    // A multi-panel Feature appears in both panels and points at the other one.
    await expect(panelCards(page, 'CaaS').first()).toContainText('OSAC-3201');
    await expect(panelCards(page, 'CaaS').first()).toContainText('also in: Core');
    await expect(panelCards(page, 'Core')).toHaveCount(1);
    await expect(panelCards(page, 'Core').first()).toContainText('OSAC-3201');

    // Feature labels, published UX/UI badges and the source Epic's own status are on the card.
    await expect(panelCards(page, 'BMaaS').first()).toContainText('customer:telus');
    await expect(panelCards(page, 'Core').first().locator('[data-testid="ux-badge"]')).toContainText('In Progress');
    await panelCards(page, 'Core').first().locator('[data-testid="epics-toggle"]').click();
    await expect(panelCards(page, 'Core').first().locator('[data-testid="source-row"]')).toContainText('OSAC-3211');
    await expect(panelCards(page, 'Core').first().locator('[data-testid="source-ux"]')).toContainText('In Progress');

    // Not on the board: no-ui, no UI/UX Epic, other release.
    for (const key of ['OSAC-3901', 'OSAC-3904', 'OSAC-2101']) {
      await expect(page.locator('[data-testid="feature-card"]', { hasText: key })).toHaveCount(0);
    }
  });

  test('lists non-delivery, no-live-source and no-ui Features under Not shown', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    const notShown = page.locator('[data-testid="not-shown"]');
    await expect(notShown.locator('summary')).toHaveText('Not shown (3)');
    await notShown.locator('summary').click();
    await expect(notShown.locator('[data-testid="not-shown-entry"]')).toHaveCount(3);
    await expect(notShown).toContainText('OSAC-3903');
    await expect(notShown).toContainText('Resolution: Duplicate');
    await expect(notShown).toContainText('OSAC-3902');
    await expect(notShown).toContainText('OSAC-3901');
    await expect(notShown).toContainText('no-ui');
    await expect(page.locator('[data-testid="feature-card"]', { hasText: 'OSAC-3903' })).toHaveCount(0);
  });

  test('puts the Release selector first in the filter toolbar and wraps it on narrow screens', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    const toolbar = page.locator('div.flex-wrap', { has: releaseSelect(page) });
    await expect(toolbar.locator('label').first()).toHaveText('Release');
    for (const name of ['Search', 'UX status', 'UI status', 'Component', 'Jira status']) {
      await expect(toolbar.locator('label').filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
    }

    // Controls wrap onto several rows and none spills out of the toolbar.
    await page.setViewportSize({ width: 640, height: 800 });
    const box = await toolbar.boundingBox();
    const controls = await toolbar.locator(':scope > div').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect()));
    expect(controls.length).toBeGreaterThanOrEqual(5);
    for (const rect of controls) expect(rect.right).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(new Set(controls.map(rect => Math.round(rect.top))).size).toBeGreaterThan(1);
  });

  test('scopes every request to the default project in the single-project shell', async ({ page }) => {
    const requests = installApi(page);
    await openDashboard(page);

    const executeRequests = requests.filter(url => url.includes('/execution/'));
    expect(executeRequests.length).toBeGreaterThan(0);
    for (const url of requests) expect(new URL(url).searchParams.get('projectId')).toBe('osac');
    expect(page.errors).toHaveLength(0);
  });

  test('manual release selection updates the panels and survives a reload', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await releaseSelect(page).selectOption('1.0');
    await expect(summary(page)).toHaveText('3 Features · 3 rows');
    await expect(panelCards(page, 'VMaaS')).toHaveCount(2);
    await expect(page).toHaveURL(/release=1\.0/);

    await page.reload();
    await expect(page.locator('[data-panel]')).toHaveCount(10);
    await expect(releaseSelect(page)).toHaveValue('1.0');
    await expect(summary(page)).toHaveText('3 Features · 3 rows');
  });

  test('puts a Feature without a Fix Version in Unscheduled, and in Other when no panel names it', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await releaseSelect(page).selectOption('Unscheduled');
    await expect(summary(page)).toHaveText('1 Feature · 1 row');
    await expect(panelCards(page, 'Other')).toHaveCount(1);
    await expect(panelCards(page, 'Other').first()).toContainText('OSAC-3501');
    await expect(panelCards(page, 'Other').first().locator('[data-testid="other-reason"]')).toContainText('no component on Feature or source epics');
  });

  test('falls back to the default release when the URL names an unavailable one', async ({ page }) => {
    installApi(page);
    await openDashboard(page, `${TAB_URL}&release=9.9`);

    await expect(releaseSelect(page)).toHaveValue('1.1');
    await expect(page.getByText('Release 9.9 is not available')).toBeVisible();
  });

  test('Status and Labels filters narrow cards and Clear filters restores them', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await chooseFilterOption(page, 'All statuses', 'In Progress');
    await expect(summary(page)).toHaveText('2 Features · 3 rows');
    await expect(panelCards(page, 'Storage')).toHaveCount(1);
    await expect(panel(page, 'Storage').locator('[data-testid="panel-count"]')).toHaveText('1 of 12');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(summary(page)).toHaveText('15 Features · 16 rows');

    await chooseFilterOption(page, 'All labels', 'customer:telus');
    await expect(summary(page)).toHaveText('1 Feature · 1 row');
    await expect(panelCards(page, 'BMaaS')).toHaveCount(1);

    await chooseFilterOption(page, 'All statuses', 'In Progress');
    await expect(page.getByText('No Features match the current filters.')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(summary(page)).toHaveText('15 Features · 16 rows');
  });

  test('Assignee matches a source Epic by default, shows how, and Feature-only matching excludes it', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await chooseFilterOption(page, 'All assignees', 'Ilya Skornyakov');
    await expect(summary(page)).toHaveText('1 Feature · 2 rows');
    await expect(panelCards(page, 'CaaS').first().locator('[data-testid="matched-via"]')).toHaveText('Matched via OSAC-3211');
    // The matching Epic is revealed and highlighted without any click.
    await expect(panelCards(page, 'CaaS').first().locator('[data-testid="source-row"][data-matched="true"]')).toBeVisible();

    await page.locator('#ui-ux-board-match-on').selectOption('feature');
    await expect(page.getByText('No Features match the current filters.')).toBeVisible();
  });

  test('collapses Epic tables by default and expands them one at a time or all at once', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    const first = panelCards(page, 'CaaS').first();
    await expect(first.locator('[data-testid="epics-toggle"]')).toHaveText('1 Epic');
    await expect(first.locator('table')).toBeHidden();
    await expect(first.locator('[data-testid="ux-badge"]')).toBeVisible();

    await first.locator('[data-testid="epics-toggle"]').click();
    await expect(first.locator('table')).toBeVisible();
    await expect(first.locator('[data-testid="source-row"]')).toContainText('OSAC-3211');

    await page.locator('[data-testid="expand-all"]').click();
    await expect(page.locator('[data-testid="epics-toggle"][aria-expanded="false"]')).toHaveCount(0);
    await page.locator('[data-testid="collapse-all"]').click();
    await expect(page.locator('[data-testid="epics-toggle"][aria-expanded="true"]')).toHaveCount(0);
  });

  test('search matches Feature and Epic keys, reveals the matching Epic and resets with Clear filters', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await page.locator('#ui-ux-board-search').fill('OSAC-3211');
    await expect(summary(page)).toHaveText('1 Feature · 2 rows');
    await expect(panelCards(page, 'CaaS').first().locator('[data-testid="source-row"][data-matched="true"]')).toBeVisible();

    await page.locator('#ui-ux-board-search').fill('OSAC-3301');
    await expect(summary(page)).toHaveText('1 Feature · 1 row');
    await expect(panelCards(page, 'BMaaS').first().locator('table')).toBeHidden();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('#ui-ux-board-search')).toHaveValue('');
    await expect(summary(page)).toHaveText('15 Features · 16 rows');
  });

  test('UX status and UI status filter on the published Feature-level rollup', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await chooseFilterOption(page, 'All UX statuses', 'Design');
    await expect(summary(page)).toHaveText('1 Feature · 1 row');
    await expect(panelCards(page, 'BMaaS')).toHaveCount(1);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(summary(page)).toHaveText('15 Features · 16 rows');

    await chooseFilterOption(page, 'All UI statuses', 'Not Started');
    await expect(summary(page)).toHaveText('1 Feature · 1 row');
    await expect(panelCards(page, 'Enclave')).toHaveCount(1);
  });

  test('Show more reveals the remaining cards and Show fewer collapses them', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await expect(panelCards(page, 'Storage')).toHaveCount(10);
    await panel(page, 'Storage').getByRole('button', { name: 'Show 2 more' }).click();
    await expect(panelCards(page, 'Storage')).toHaveCount(12);
    await panel(page, 'Storage').getByRole('button', { name: 'Show fewer' }).click();
    await expect(panelCards(page, 'Storage')).toHaveCount(10);
  });

  test('a collapsed panel stays collapsed while filters change', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    const header = panel(page, 'Core').locator('h3 button');
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');

    await chooseFilterOption(page, 'All statuses', 'Backlog');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  test('shows only the error, with no counts, panels or freshness, when the Feature inventory fails to load', async ({ page }) => {
    installApi(page);
    await page.route('**/api/modules/releases/execution/features**', route =>
      route.fulfill({ status: 500, json: { error: 'Features unavailable' } }));
    await page.goto(TAB_URL);

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[data-panel]')).toHaveCount(0);
    await expect(summary(page)).toHaveCount(0);
    await expect(page.locator('[data-testid="fetched-at"]')).toHaveCount(0);
    await expect(page.getByText('No matching Features')).toHaveCount(0);
  });

  test('is offered for OSAC and hidden for other projects, including by deep link', async ({ page }) => {
    const projects = [{ projectId: 'osac', displayName: 'OSAC' }, { projectId: 'flightctl', displayName: 'Flight Control' }];
    installApi(page, { projects });
    const tabs = page.getByRole('navigation', { name: 'Execute sub-tabs' });

    await page.goto(`${TAB_URL}&projectId=osac`);
    await expect(tabs.getByRole('button', { name: 'UI/UX by Component' })).toBeVisible();
    await expect(page.locator('[data-panel]')).toHaveCount(10);

    await page.goto(`${TAB_URL}&projectId=flightctl`);
    await expect(tabs.getByRole('button', { name: 'Feature List' })).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'UI/UX by Component' })).toHaveCount(0);
    await expect(heading(page)).toHaveCount(0);
  });
});
