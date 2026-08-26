import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureMetricsRow from '../../client/components/FeatureMetricsRow.vue';

function makeFeature(overrides = {}) {
  return {
    key: 'OSAC-1',
    title: 'Some feature',
    priority: 'Major',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    scores: { total: 6 },
    designStatus: 'reviewed',
    components: [],
    ...overrides
  };
}

// Grab a metric tile's value by its label text.
function tileValue(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
  return tile.find('span').text();
}

describe('FeatureMetricsRow no-design exclusion', () => {
  const features = {
    'OSAC-1': makeFeature({ key: 'OSAC-1', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
    'OSAC-2': makeFeature({ key: 'OSAC-2', humanReviewStatus: 'awaiting-review', recommendation: 'revise', scores: { total: 4 } }),
    // Back-filled feature with no design review — must not skew review tiles/averages.
    'OSAC-3': makeFeature({ key: 'OSAC-3', humanReviewStatus: 'awaiting-review', recommendation: null, scores: null, designStatus: 'no-design' }),
    'OSAC-4': makeFeature({ key: 'OSAC-4', humanReviewStatus: 'awaiting-review', recommendation: null, scores: null, designStatus: 'no-design' })
  };

  it('Total Features counts every feature, including no-design ones', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Features')).toBe('4');
  });

  it('Needs Action excludes no-design features', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // Only OSAC-2 is a reviewed feature awaiting sign-off; OSAC-3/OSAC-4 are no-design.
    expect(tileValue(wrapper, 'Needs Action')).toBe('1');
  });

  it('Signed Off counts only reviewed approved features', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Signed Off')).toBe('1');
  });

  it('Avg Score is computed over reviewed features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // (8 + 4) / 2 = 6.0, unaffected by the two no-design (null-score) features.
    expect(tileValue(wrapper, 'Avg Score')).toBe('6.0');
  });

  it('Approval Rate is computed over reviewed features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // 1 approve out of 2 reviewed = 50%.
    expect(tileValue(wrapper, 'Approval Rate')).toBe('50%');
  });
});
