const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const osacIndex = require('../../fixtures/releases/execution/index.json');
const osacFeatureDetail = require('../../fixtures/releases/execution/features/TEST1-52.json');
const osacTrackingData = require('../../fixtures/releases/execution/tracking-data-rhoai-2.14.json');
const flightctlIndexEnvelope = require('../../fixtures/projects/flightctl/releases/execution/index.json');
const flightctlFeatureOneEnvelope = require('../../fixtures/projects/flightctl/releases/execution/features/EDM-1001.json');
const flightctlFeatureTwoEnvelope = require('../../fixtures/projects/flightctl/releases/execution/features/EDM-1002.json');
const flightctlClosedFeatureEnvelopes = ['EDM-1003', 'EDM-1004', 'EDM-1005'].map(key =>
  require(`../../fixtures/projects/flightctl/releases/execution/features/${key}.json`));
const flightctlProfile = require('../../fixtures/projects/flightctl/profile.json');
const flightctlRosterEnvelope = require('../../fixtures/projects/flightctl/sources/roster/registry.json');
const flightctlTrackingEnvelope = require('../../fixtures/projects/flightctl/releases/execution/tracking-data-flightctl-0.10.0.json');

const flightctlIndex = flightctlIndexEnvelope.data;
const flightctlFeatureDetails = {
  'EDM-1001': flightctlFeatureOneEnvelope.data,
  'EDM-1002': flightctlFeatureTwoEnvelope.data,
  ...Object.fromEntries(flightctlClosedFeatureEnvelopes.map(envelope => [envelope.data.key, envelope.data]))
};
// The list route derives these from the project profile.
const flightctlPolicy = {
  terminalOutcomeProfile: flightctlProfile.execution.workStatus.terminalOutcomes,
  closedFeatureVisibility: flightctlProfile.execution.inventory.closedFeatureVisibility
};
const osacFeature = osacIndex.features.find(feature => feature.key === 'TEST1-52');
const osacRelease = 'rhoai-3.0';
const screenshotDir = path.resolve(__dirname, '../../docs/onboarding/flightctl/shared-execute-verification-assets');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function captureSharedExecuteScreenshot(page, projectId, tabId) {
  if (process.env.CAPTURE_SHARED_EXECUTE_SCREENSHOTS !== '1') return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, `${projectId}-${tabId}.png`),
    fullPage: true
  });
}

function detailFor(projectId, key) {
  if (projectId === 'flightctl') return clone(flightctlFeatureDetails[key]);
  return clone(key === osacFeature.key ? osacFeatureDetail : null);
}

function getFeatureIndex(projectId) {
  if (projectId === 'flightctl') return flightctlIndex.features;
  return osacIndex.features;
}

function featureVersions(projectId, scope) {
  if (projectId === 'flightctl') {
    return scope === 'epics'
      ? flightctlIndex.versionOptions.epics
      : flightctlIndex.versionOptions.feature;
  }
  const versions = new Set(osacIndex.features.flatMap(feature => feature.fixVersions || []));
  return [osacRelease, ...[...versions].filter(version => version !== osacRelease).sort()];
}

function trackingReleases(projectId) {
  if (projectId === 'flightctl') return flightctlIndex.trackingReleases;
  return [{
    releaseId: osacTrackingData.releaseId,
    displayName: osacTrackingData.displayName,
    fixVersions: osacTrackingData.fixVersions,
    baselineDate: osacTrackingData.baselineDate,
    baselineSource: osacTrackingData.baselineSource,
    featureCount: osacTrackingData.featureCount,
    counts: osacTrackingData.counts,
    state: 'supported',
    partial: false
  }];
}

function installExecuteApi(page, { delayOsacFeatures = false } = {}) {
  const requests = [];
  let notifyOsacFeaturesRequested = () => {};
  let releaseOsacFeatures;
  const osacFeaturesRequested = new Promise(resolve => { notifyOsacFeaturesRequested = resolve; });
  const osacFeaturesGate = new Promise(resolve => { releaseOsacFeatures = resolve; });

  // The dev server runs Vite only. Return harmless empty responses for shell APIs
  // that are unrelated to this browser contract; specific routes below override it.
  page.route('**/api/**', route => route.fulfill({ json: {} }));
  page.route('**/api/projects', route => route.fulfill({ json: { projects: [
    { projectId: 'osac', displayName: 'OSAC' },
    { projectId: 'flightctl', displayName: 'Flight Control' }
  ] } }));
  page.route('**/api/roster?**', route => {
    const projectId = new URL(route.request().url()).searchParams.get('projectId');
    return route.fulfill({ json: { projectId, availability: 'available', orgs: [], people: [] } });
  });
  page.route('**/api/modules/releases/execution/**', async route => {
    const url = new URL(route.request().url());
    const projectId = url.searchParams.get('projectId');
    const pathname = url.pathname.replace('/api/modules/releases/execution', '');
    requests.push({ pathname, projectId, url: route.request().url() });

    if (delayOsacFeatures && pathname === '/features' && projectId === 'osac') {
      notifyOsacFeaturesRequested();
      await osacFeaturesGate;
    }

    if (pathname === '/features') {
      const features = clone(getFeatureIndex(projectId));
      const partial = projectId === 'flightctl' && flightctlIndexEnvelope.partial === true;
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        freshness: projectId === 'flightctl' ? flightctlIndexEnvelope.freshness : 'fresh',
        partial,
        fetchedAt: projectId === 'flightctl' ? flightctlIndex.fetchedAt : osacIndex.fetchedAt,
        featureCount: features.length,
        totalFeatureCount: features.length,
        ...(projectId === 'flightctl' ? flightctlPolicy : { closedFeatureVisibility: 'release-scoped' }),
        features
      } });
    }

    const detailMatch = pathname.match(/^\/features\/([^/]+)$/);
    if (detailMatch) {
      const key = decodeURIComponent(detailMatch[1]);
      const detail = detailFor(projectId, key);
      return detail
        ? route.fulfill({ json: { ...detail, projectId, state: 'supported', detailState: 'supported' } })
        : route.fulfill({ status: 404, json: { error: `Feature ${key} not found` } });
    }

    if (pathname === '/versions') {
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        partial: false,
        versions: featureVersions(projectId, url.searchParams.get('scope'))
      } });
    }

    if (pathname === '/epics') {
      const version = url.searchParams.get('version');
      const features = getFeatureIndex(projectId)
        .filter(feature => (feature.fixVersions || []).includes(version))
        .map(feature => {
          const detail = detailFor(projectId, feature.key);
          const epics = detail?.epics || [];
          return {
            key: feature.key,
            summary: feature.summary,
            status: feature.status,
            statusCategory: feature.statusCategory,
            fixVersions: feature.fixVersions || [],
            components: feature.components || [],
            team: feature.team || null,
            coverage: feature.coverage || null,
            isContext: false,
            detailState: detail ? 'supported' : 'unavailable',
            totalEpicCount: detail ? epics.length : null,
            epics
          };
        });
      return route.fulfill({ json: {
        projectId,
        version,
        state: 'supported',
        partial: false,
        fetchedAt: projectId === 'flightctl' ? flightctlIndex.fetchedAt : osacIndex.fetchedAt,
        featureCount: features.length,
        hierarchyCoverage: 'complete',
        hierarchy: clone(projectId === 'flightctl' ? flightctlIndex.hierarchy : osacIndex.hierarchy || null),
        features
      } });
    }

    if (pathname === '/tracking/releases') {
      return route.fulfill({ json: {
        projectId,
        state: 'supported',
        freshness: 'fresh',
        partial: false,
        baselinePolicy: projectId === 'flightctl' ? 'unconfigured' : 'configured',
        releases: trackingReleases(projectId)
      } });
    }

    if (pathname === '/tracking/data') {
      const releaseId = url.searchParams.get('releaseId');
      const data = projectId === 'flightctl'
        ? clone(flightctlTrackingEnvelope.data)
        : clone(osacTrackingData);
      return route.fulfill({ json: {
        ...data,
        projectId,
        state: 'supported',
        freshness: projectId === 'flightctl' ? flightctlTrackingEnvelope.freshness : 'fresh',
        partial: projectId === 'flightctl' && flightctlTrackingEnvelope.partial === true,
        releaseId
      } });
    }

    return route.fulfill({ status: 404, json: { projectId, error: 'Unknown Execute test endpoint' } });
  });

  return {
    requests,
    osacFeaturesRequested,
    releaseOsacFeatures: () => releaseOsacFeatures()
  };
}

// Feature Tracking, Epics by Release and UI/UX by Component are offered for OSAC only.
async function expectSharedTabs(page, projectId) {
  const tabs = page.locator('nav[aria-label="Execute sub-tabs"] button');
  await expect(tabs).toHaveText(projectId === 'osac'
    ? ['Feature List', 'Feature Tracking', 'Epics by Release', 'UI/UX by Component']
    : ['Feature List']);
}

test.describe('Shared Releases Execute @releases', () => {
  test.setTimeout(60000);

  test('keeps the OSAC tabs and interactions for OSAC and Flight Control', async ({ page }) => {
    const api = installExecuteApi(page);
    await page.goto('/#/releases/execute?projectId=osac');
    await expect(page.locator('#project-selector')).toHaveValue('osac');
    await expectSharedTabs(page, 'osac');

    for (const projectId of ['osac', 'flightctl']) {
      if (projectId === 'flightctl') {
        await page.locator('#project-selector').selectOption('flightctl');
        await expect(page).toHaveURL(/projectId=flightctl/);
      }

      await expectSharedTabs(page, projectId);
      await page.getByRole('button', { name: 'Feature List', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Feature Execution Overview' })).toBeVisible();
      await page.getByRole('button', { name: 'List', exact: true }).click();

      if (projectId === 'osac') {
        await page.getByLabel('Search').fill(osacFeature.key);
        const detailButton = page.getByRole('button', { name: `Open details for ${osacFeature.key}`, exact: true });
        await expect(detailButton).toBeVisible();
        await captureSharedExecuteScreenshot(page, projectId, 'feature-list');
        await detailButton.click();
        const drawer = page.getByRole('dialog', { name: `Feature details for ${osacFeature.key}` });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText('Details', { exact: true })).toBeVisible();
        await drawer.getByRole('button', { name: 'Close detail panel' }).click();
      } else {
        await expect(page.getByText(/No compatible pipeline execution producer is configured/)).toBeVisible();
        await expect(page.getByText(/does not establish Feature completion, pipeline success, or release readiness/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Board', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Board', exact: true }).click();
        await expect(page.getByText(/With known work status:/)).toBeVisible();
        await expect(page.getByText(/Unknown work status:/)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'In Progress', exact: true })).toBeVisible();
        await expect(page.getByText(/1\/1 Jira Done/)).toBeVisible();

        // Versionless Closed Features are reachable without a Release; only confirmed completion is Done.
        const doneSection = page.locator('#execution-section-complete');
        await expect(doneSection).toContainText('EDM-1003');
        await expect(doneSection).not.toContainText('EDM-1004');
        await expect(doneSection).not.toContainText('EDM-1005');
        await page.getByRole('button', { name: /^Closed without delivery:/ }).click();
        const withoutDelivery = page.locator('#closed-without-delivery-panel');
        await expect(withoutDelivery).toContainText('EDM-1004');
        await expect(withoutDelivery).toContainText("Won't Do");
        await page.getByRole('button', { name: /^Closed, outcome unknown:/ }).click();
        await expect(page.locator('#closed-outcome-unknown-panel')).toContainText('EDM-1005');

        await page.getByRole('button', { name: 'List', exact: true }).click();
        await page.getByLabel('Search').fill('EDM-1002');
        const row = page.getByRole('row').filter({ hasText: 'EDM-1002' });
        await expect(row).toBeVisible();
        await expect(row.getByRole('cell').nth(3)).toContainText('Not Started');
        await expect(row.getByRole('cell').nth(7)).toHaveText('0');
        await expect(row).toContainText('Unknown');
        await captureSharedExecuteScreenshot(page, projectId, 'feature-list');
        await page.getByRole('button', { name: 'Open details for EDM-1002', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: 'Feature details for EDM-1002' });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText('Jira Team', { exact: true })).toHaveCount(0);
        await expect(drawer.getByTestId('drawer-design-pr')).toHaveText(/Design PR\s*Unknown/);
        await drawer.getByRole('button', { name: 'Close detail panel' }).click();

        await page.getByLabel('Search').fill('EDM-1001');
        await expect(page.getByRole('row').filter({ hasText: 'EDM-1001' })).toContainText('Pending');
        await page.getByRole('button', { name: 'Open details for EDM-1001', exact: true }).click();
        const progressDrawer = page.getByRole('dialog', { name: 'Feature details for EDM-1001' });
        await expect(progressDrawer.getByText('Jira Child Progress', { exact: true })).toBeVisible();
        await expect(progressDrawer.getByText(/Work Status comes from its own Jira status/)).toBeVisible();
        const designPr = progressDrawer.getByTestId('drawer-design-pr');
        await expect(designPr.getByRole('link', { name: 'Open Design PR #80 on GitHub' }))
          .toHaveAttribute('href', 'https://github.com/flightctl/design-docs/pull/80');
        await expect(designPr).toContainText('Open, approved — not yet merged');
        await expect(progressDrawer.getByText(/1 of 1 configured Jira child issues are Done/)).toBeVisible();
        await expect(progressDrawer.getByText(/does not establish Feature completion, pipeline success, or release readiness/)).toBeVisible();
        await progressDrawer.getByRole('button', { name: 'Close detail panel' }).click();
      }

      if (projectId === 'osac') {
        await page.getByRole('button', { name: 'Feature Tracking', exact: true }).click();
        await expect(page.getByText("Features committed to each release's baseline scope, and what changed since.")).toBeVisible();
        await expect(page.getByRole('button', { name: 'RHOAI 2.14', exact: true })).toBeVisible();
        await captureSharedExecuteScreenshot(page, projectId, 'feature-tracking');

        await page.getByRole('button', { name: 'Epics by Release', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Epics by Release' })).toBeVisible();
        await expect(page.locator('#epics-by-release-version')).toHaveValue(osacRelease);
        await expect(page.getByText(osacFeature.key, { exact: true })).toBeVisible();
        await expect(page.getByText('TEST2-33439', { exact: true })).toBeVisible();
        await captureSharedExecuteScreenshot(page, projectId, 'epics-by-release');
      }
    }

    expect(api.requests.length).toBeGreaterThan(0);
    expect(api.requests.every(request => ['osac', 'flightctl'].includes(request.projectId))).toBe(true);
    expect(api.requests.some(request => request.pathname === '/presentation')).toBe(false);
  });

  test('discards an OSAC response that arrives after switching to Flight Control', async ({ page }) => {
    const api = installExecuteApi(page, { delayOsacFeatures: true });
    await page.goto('/#/releases/execute?projectId=osac');
    await api.osacFeaturesRequested;

    try {
      await page.locator('#project-selector').selectOption('flightctl');
      await expect(page).toHaveURL(/projectId=flightctl/);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: 'EDM-1002' })).toBeVisible();
    } finally {
      api.releaseOsacFeatures();
    }

    await page.waitForResponse(response => response.url().includes('/execution/features?projectId=osac'));
    await expect(page.getByRole('row').filter({ hasText: 'EDM-1002' })).toBeVisible();
    await expect(page.getByText('TEST1-52', { exact: true })).toHaveCount(0);
    expect(api.requests.some(request => request.pathname === '/features' && request.projectId === 'flightctl')).toBe(true);
  });

  test('filters Flight Control Features by the assignee’s team and hides the filter without a project roster', async ({ page }) => {
    installExecuteApi(page);
    const rosterData = flightctlRosterEnvelope.data;
    await page.route('**/api/roster?**', route => {
      const projectId = new URL(route.request().url()).searchParams.get('projectId');
      if (projectId !== 'flightctl') {
        return route.fulfill({ json: { projectId, availability: 'available', orgs: [], people: [] } });
      }
      return route.fulfill({ json: {
        projectId,
        availability: 'available',
        teams: rosterData.teams.map(team => ({
          key: `${projectId}::${team.id}`,
          id: team.id,
          displayName: team.name,
          memberAccountIds: rosterData.people
            .filter(person => person.active && person.teamIds.includes(team.id))
            .map(person => person.accountId)
        })),
        people: rosterData.people
      } });
    });

    await page.goto('/#/releases/execute?projectId=flightctl');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const rowFor = key => page.getByRole('row').filter({ hasText: key });
    await expect(rowFor('EDM-1001')).toBeVisible();
    await expect(rowFor('EDM-1002')).toBeVisible();

    const filter = page.getByTestId('assignee-team-filter');
    await filter.getByRole('button', { name: 'All teams' }).click();
    await filter.getByLabel('Flight Control UI').check();
    await expect(rowFor('EDM-1001')).toBeVisible();
    await expect(rowFor('EDM-1002')).toHaveCount(0);

    await filter.getByLabel('Unassigned').check();
    await expect(rowFor('EDM-1002')).toBeVisible();

    await page.locator('#project-selector').selectOption('osac');
    await expect(page).toHaveURL(/projectId=osac/);
    await expect(page.getByRole('heading', { name: 'Feature Execution Overview' })).toBeVisible();
    await expect(page.getByTestId('assignee-team-filter')).toHaveCount(0);
  });

  test('unknown project shows not found and does not load OSAC Execute data', async ({ page }) => {
    const api = installExecuteApi(page);
    await page.goto('/#/releases/execute?projectId=unknown');
    await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible();
    await expect(page.locator('nav[aria-label="Execute sub-tabs"]')).toHaveCount(0);
    expect(api.requests).toEqual([]);
  });
});
