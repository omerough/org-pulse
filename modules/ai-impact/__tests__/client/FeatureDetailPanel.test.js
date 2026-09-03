import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FeatureDetailPanel from '../../client/components/FeatureDetailPanel.vue';

let wrapper;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const PHASES = [
  { id: 'prd-review', name: 'PRD Review' },
  { id: 'design-review', name: 'Design Review' }
];

function makeFeature(overrides = {}) {
  return {
    key: 'OSAC-1',
    title: 'Some feature',
    priority: 'Major',
    status: 'In Progress',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    scores: { feasibility: 2, testability: 2, scope: 1, architecture: 2, total: 7 },
    reviewers: { feasibility: 'approve', testability: 'approve', scope: 'revise', architecture: 'approve' },
    criterionNotes: {
      feasibility: 'Feasibility note.',
      scope: 'Scope note.'
    },
    ...overrides
  };
}

// FeatureDetailPanel renders via <Teleport to="body">, so assert against document.body.
function mountPanel(feature) {
  return mount(FeatureDetailPanel, {
    props: { show: true, feature, phases: PHASES },
    attachTo: document.body
  });
}

function dimensionCard(label) {
  return [...document.body.querySelectorAll('.grid.grid-cols-2 > div')]
    .find(el => el.textContent.toLowerCase().includes(label));
}

describe('FeatureDetailPanel dimension selection', () => {
  it('keeps the 2-column grid stable when a dimension is selected', async () => {
    wrapper = mountPanel(makeFeature());
    const grid = document.body.querySelector('.grid.grid-cols-2');
    expect(grid.className).toContain('grid-cols-2');

    dimensionCard('feasibility').click();
    await nextTick();

    expect(grid.className).toContain('grid-cols-2');
    grid.querySelectorAll(':scope > div').forEach(card => {
      expect(card.className).not.toContain('col-span-2');
    });
  });

  it('shows the selected dimension explanation in a detail area below the grid', async () => {
    wrapper = mountPanel(makeFeature());
    expect(document.body.textContent).not.toContain('Feasibility note.');

    dimensionCard('feasibility').click();
    await nextTick();

    expect(document.body.textContent).toContain('Feasibility note.');
  });

  it('switching selection replaces the displayed explanation', async () => {
    wrapper = mountPanel(makeFeature());

    dimensionCard('feasibility').click();
    await nextTick();
    expect(document.body.textContent).toContain('Feasibility note.');
    expect(document.body.textContent).not.toContain('Scope note.');

    dimensionCard('scope').click();
    await nextTick();
    expect(document.body.textContent).toContain('Scope note.');
    expect(document.body.textContent).not.toContain('Feasibility note.');
  });

  it('clicking the selected dimension again closes the detail panel', async () => {
    wrapper = mountPanel(makeFeature());
    const card = dimensionCard('feasibility');

    card.click();
    await nextTick();
    expect(document.body.textContent).toContain('Feasibility note.');

    card.click();
    await nextTick();
    expect(document.body.textContent).not.toContain('Feasibility note.');
  });

  it('shows a fallback message for a selected dimension with no notes', async () => {
    wrapper = mountPanel(makeFeature());

    dimensionCard('testability').click();
    await nextTick();

    expect(document.body.textContent).toContain('No notes available.');
  });
});

describe('FeatureDetailPanel Component / Fix Version metadata', () => {
  it('shows both groups when present', () => {
    wrapper = mountPanel(makeFeature({ components: ['Core'], fixVersions: ['0.3'] }));
    expect(document.body.textContent).toContain('Component');
    expect(document.body.textContent).toContain('Core');
    expect(document.body.textContent).toContain('Fix Version');
    expect(document.body.textContent).toContain('0.3');
  });

  it('hides Fix Version when only Component is present', () => {
    wrapper = mountPanel(makeFeature({ components: ['Core'], fixVersions: [] }));
    expect(document.body.textContent).toContain('Component');
    expect(document.body.textContent).not.toContain('Fix Version');
  });

  it('hides both groups when empty', () => {
    wrapper = mountPanel(makeFeature({ components: [], fixVersions: [] }));
    expect(document.body.textContent).not.toContain('Component');
    expect(document.body.textContent).not.toContain('Fix Version');
  });

  it('wraps multiple values as chips within a group', () => {
    wrapper = mountPanel(makeFeature({ components: ['Core', 'Networking'], fixVersions: ['0.3', '0.4'] }));
    expect(document.body.textContent).toContain('Core');
    expect(document.body.textContent).toContain('Networking');
    expect(document.body.textContent).toContain('0.3');
    expect(document.body.textContent).toContain('0.4');
  });

  it('uses the same 3-column grid geometry as the metadata grid above it, with Component fixed in column 1', () => {
    wrapper = mountPanel(makeFeature({ components: ['Core'], fixVersions: ['0.3'] }));
    const metadataGrid = document.body.querySelector('.grid.grid-cols-3');
    const chipRow = [...document.body.querySelectorAll('.grid.grid-cols-3')][1];

    expect(chipRow.className).toBe(metadataGrid.className);
    expect(chipRow.children[0].textContent).toContain('Component');
    expect(chipRow.children[1].textContent).toContain('Fix Version');
  });

  it('keeps Component in column 1 even when Fix Version is the only group present', () => {
    wrapper = mountPanel(makeFeature({ components: [], fixVersions: ['0.3'] }));
    const chipRow = [...document.body.querySelectorAll('.grid.grid-cols-3')][1];

    expect(chipRow.children[0].textContent).not.toContain('Fix Version');
    expect(chipRow.children[1].textContent).toContain('Fix Version');
  });
});

describe('FeatureDetailPanel Quality Assessment Score/Recommendation', () => {
  it('moves AI Recommendation out of the top metadata into Quality Assessment, without duplicating it', () => {
    wrapper = mountPanel(makeFeature({ recommendation: 'approve' }));
    const metadataGrid = document.body.querySelector('.grid.grid-cols-3');

    expect(metadataGrid.textContent).not.toContain('Recommendation');
    expect(document.body.textContent).toContain('Quality Assessment');

    const approveMatches = [...document.body.querySelectorAll('*')]
      .filter(el => el.children.length === 0 && el.textContent.trim() === 'Approve');
    expect(approveMatches).toHaveLength(1);
  });

  it('shows Score and Recommendation side by side inside Quality Assessment', () => {
    wrapper = mountPanel(makeFeature({ scores: { feasibility: 2, testability: 2, scope: 2, architecture: 2, total: 8 }, recommendation: 'approve' }));

    expect(document.body.textContent).toContain('Score');
    expect(document.body.textContent).toContain('8/8');
    expect(document.body.textContent).toContain('Recommendation');
    expect(document.body.textContent).toContain('Approve');
  });

  it('keeps Review Status in the top metadata grid', () => {
    wrapper = mountPanel(makeFeature({ humanReviewStatus: 'approved' }));
    const metadataGrid = document.body.querySelector('.grid.grid-cols-3');
    expect(metadataGrid.textContent).toContain('Review Status');
  });
});
