const { test, expect } = require('@playwright/test');
const { setupErrorTracking, logCapturedErrors } = require('./helpers');

/**
 * UI Epics by Component flow. Projects, roster, registry and Execute versions/epics are mocked
 * (demo data has no bootstrap Epics); other requests reach the demo backend.
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
const VERSIONS = ['1.0', '1.1', '1.2'];

function epic(key, overrides = {}) {
  return {
    key, summary: `${key} summary`, status: 'Closed', statusCategory: 'Done', resolution: null,
    priority: 'Undefined', assignee: null, components: [], componentSource: 'direct',
    fixVersions: ['1.1'], fixVersionSource: 'direct', labels: ['bootstrap'],
    created: '2026-09-01T10:00:00.000+0000', updated: '2026-10-20T10:00:00.000+0000',
    parentFeatureKey: 'OSAC-3000', issues: [], ...overrides
  };
}

function feature(key, epics) {
  return { key, summary: key, status: 'In Progress', fixVersions: ['1.1'], components: [], team: null, coverage: null, isContext: false, detailState: 'supported', epics };
}

const storageEpics = Array.from({ length: 12 }, (_, i) => epic(`OSAC-31${String(i + 1).padStart(2, '0')}`, {
  components: ['Storage'],
  status: i === 0 ? 'In Progress' : i < 6 ? 'Closed' : 'Backlog'
}));

const RELEASE_1_1_EPICS = [
  ...storageEpics,
  epic('OSAC-3201', { components: ['CaaS', 'Core'], status: 'In Progress', assignee: 'Ilya Skornyakov', labels: ['bootstrap', 'ux-complete'] }),
  epic('OSAC-3301', { components: ['BMaaS'], status: 'Backlog', labels: ['bootstrap', 'be-completed'] }),
  epic('OSAC-3401', { components: ['Enclave'], labels: ['bootstrap', 'ui-enclave-only'] }),
  // Never listed: no-ui, inherited component, Duplicate resolution, other Jira project, other Fix Version.
  epic('OSAC-3901', { components: ['Core'], labels: ['bootstrap', 'no-ui'] }),
  epic('OSAC-3902', { components: ['Storage'], componentSource: 'via-parent-feature' }),
  epic('OSAC-3903', { components: ['Storage'], resolution: 'Duplicate' }),
  epic('MGMT-3904', { components: ['Storage'] }),
  epic('OSAC-3905', { components: ['Storage'], fixVersions: ['1.0'] })
];

// A stale second record of OSAC-3101 that would add it to Core if the freshest record did not win.
const STALE_DUPLICATE = epic('OSAC-3101', { components: ['Core'], updated: '2026-09-15T10:00:00.000+0000', parentFeatureKey: 'OSAC-3001' });

const RELEASE_1_0_EPICS = [
  epic('OSAC-2101', { components: ['VMaaS'], fixVersions: ['1.0'] }),
  epic('OSAC-2102', { components: ['VMaaS'], fixVersions: ['1.0'] }),
  epic('OSAC-2103', { components: ['Core'], fixVersions: ['1.0'] })
];

function epicsFor(version) {
  const features = version === '1.1'
    ? [feature('OSAC-3001', [STALE_DUPLICATE]), feature('OSAC-3000', RELEASE_1_1_EPICS)]
    : version === '1.0' ? [feature('OSAC-2000', RELEASE_1_0_EPICS)] : [];
  return { version, fetchedAt: '2026-10-26T10:33:00Z', featureCount: features.length, state: features.length ? 'supported' : 'empty', features };
}

// Publishing only OSAC puts the shell in single-project mode, which leaves projectId empty.
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
  page.route('**/api/modules/releases/execution/versions**', route => {
    requests.push(route.request().url());
    return route.fulfill({ json: { state: 'supported', versions: VERSIONS } });
  });
  page.route('**/api/modules/releases/execution/epics**', route => {
    requests.push(route.request().url());
    const version = new URL(route.request().url()).searchParams.get('version');
    return route.fulfill({ json: epicsFor(version) });
  });
  return requests;
}

const releaseSelect = page => page.locator('#epics-by-component-release');
const panel = (page, name) => page.locator(`[data-panel="${name}"]`);
const panelRows = (page, name) => panel(page, name).locator('[data-testid="epic-row"]');
const summary = page => page.locator('[data-testid="summary-counts"]');

async function openDashboard(page, url = TAB_URL) {
  await page.goto(url);
  await expect(page.locator('[data-panel]')).toHaveCount(9);
}

async function chooseFilterOption(page, triggerName, optionName) {
  await page.getByRole('button', { name: triggerName }).click();
  await page.getByRole('checkbox', { name: optionName, exact: true }).check();
  await page.getByRole('heading', { name: 'UI Epics by Component' }).click();
}

test.describe('Releases UI Epics by Component @releases', () => {
  test.beforeEach(async ({ page }) => {
    setupErrorTracking(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    logCapturedErrors(page, testInfo);
  });

  test('defaults to the next GA release and renders the expected Component panels and rows', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await expect(releaseSelect(page)).toHaveValue('1.1');
    await expect(releaseSelect(page).locator('option:checked')).toContainText('Next GA');
    await expect(page).toHaveURL(/release=1\.1/);
    await expect(page.getByText('Bootstrap Epics only')).toBeVisible();

    await expect(summary(page)).toHaveText('15 Epics · 16 rows');
    await expect(panelRows(page, 'Storage')).toHaveCount(10);
    await expect(panelRows(page, 'CaaS')).toHaveCount(1);
    await expect(panelRows(page, 'BMaaS')).toHaveCount(1);
    await expect(panelRows(page, 'Enclave')).toHaveCount(1);
    await expect(panelRows(page, 'Observability')).toHaveCount(0);

    // Multi-panel Epic appears in both panels and points at the other one.
    await expect(panelRows(page, 'CaaS').first()).toContainText('OSAC-3201');
    await expect(panelRows(page, 'CaaS').first()).toContainText('also in: Core');
    await expect(panelRows(page, 'Core')).toHaveCount(1);
    await expect(panelRows(page, 'Core').first()).toContainText('OSAC-3201');

    // The freshest duplicate record wins, so the stale Core record never appears.
    await expect(panel(page, 'Core')).not.toContainText('OSAC-3101');
    await expect(panel(page, 'Storage')).toContainText('OSAC-3101');

    for (const key of ['OSAC-3901', 'OSAC-3902', 'OSAC-3903', 'MGMT-3904', 'OSAC-3905']) {
      await expect(page.getByText(key, { exact: true })).toHaveCount(0);
    }
  });

  test('scopes requests for the single-project shell: no projectId on Execute data, explicit on the registry', async ({ page }) => {
    const requests = installApi(page);
    await openDashboard(page);

    const executeRequests = requests.filter(url => url.includes('/execution/'));
    expect(executeRequests.length).toBeGreaterThan(0);
    for (const url of executeRequests) expect(url).not.toContain('projectId');
    expect(requests.filter(url => url.includes('/registry')).every(url => url.includes('projectId=osac'))).toBe(true);
    expect(page.errors).toHaveLength(0);
  });

  test('manual release selection updates the panels and survives a reload', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await releaseSelect(page).selectOption('1.0');
    await expect(summary(page)).toHaveText('3 Epics · 3 rows');
    await expect(panelRows(page, 'VMaaS')).toHaveCount(2);
    await expect(page).toHaveURL(/release=1\.0/);

    await page.reload();
    await expect(page.locator('[data-panel]')).toHaveCount(9);
    await expect(releaseSelect(page)).toHaveValue('1.0');
    await expect(summary(page)).toHaveText('3 Epics · 3 rows');
  });

  test('falls back to the default release when the URL names an unavailable one', async ({ page }) => {
    installApi(page);
    await openDashboard(page, `${TAB_URL}&release=9.9`);

    await expect(releaseSelect(page)).toHaveValue('1.1');
    await expect(page.getByText('Release 9.9 is not available')).toBeVisible();
  });

  test('Status and Labels filters narrow rows and Clear filters restores them', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await chooseFilterOption(page, 'All statuses', 'In Progress');
    await expect(summary(page)).toHaveText('2 Epics · 3 rows');
    await expect(panelRows(page, 'Storage')).toHaveCount(1);
    await expect(panel(page, 'Storage').locator('[data-testid="panel-count"]')).toHaveText('1 of 12');

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(summary(page)).toHaveText('15 Epics · 16 rows');

    await chooseFilterOption(page, 'All labels', 'be-completed');
    await expect(summary(page)).toHaveText('1 Epic · 1 row');
    await expect(panelRows(page, 'BMaaS')).toHaveCount(1);

    await chooseFilterOption(page, 'All statuses', 'In Progress');
    await expect(page.getByText('No Epics match the current filters.')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(summary(page)).toHaveText('15 Epics · 16 rows');
  });

  test('Show more reveals the remaining rows and Show fewer collapses them', async ({ page }) => {
    installApi(page);
    await openDashboard(page);

    await expect(panelRows(page, 'Storage')).toHaveCount(10);
    await panel(page, 'Storage').getByRole('button', { name: 'Show 2 more' }).click();
    await expect(panelRows(page, 'Storage')).toHaveCount(12);
    await panel(page, 'Storage').getByRole('button', { name: 'Show fewer' }).click();
    await expect(panelRows(page, 'Storage')).toHaveCount(10);
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

    // Changing the release starts the panels over from their defaults.
    await releaseSelect(page).selectOption('1.0');
    await expect(summary(page)).toHaveText('3 Epics · 3 rows');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  test('is offered for OSAC and hidden for other projects, including by deep link', async ({ page }) => {
    const projects = [{ projectId: 'osac', displayName: 'OSAC' }, { projectId: 'flightctl', displayName: 'Flight Control' }];
    installApi(page, { projects });
    const tabs = page.getByRole('navigation', { name: 'Execute sub-tabs' });

    await page.goto(`${TAB_URL}&projectId=osac`);
    await expect(tabs.getByRole('button', { name: 'UI Epics by Component' })).toBeVisible();
    await expect(page.locator('[data-panel]')).toHaveCount(9);

    await page.goto(`${TAB_URL}&projectId=flightctl`);
    await expect(tabs.getByRole('button', { name: 'Hygiene' })).toBeVisible();
    await expect(tabs.getByRole('button', { name: 'UI Epics by Component' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'UI Epics by Component' })).toHaveCount(0);
  });
});
