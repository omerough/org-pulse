import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { Bar } from 'vue-chartjs';
import CriteriaBreakdownChart from '../../client/components/CriteriaBreakdownChart.vue';
import { SCORE_HEX, scoreRgba } from '../../client/utils/score-colors.js';

// Per-criterion score sequences (10 v2 assessments), chosen to hit an exact
// 2.0, an exact 1.0 boundary, and fractional averages on both sides of the
// amber/red cutoff — the naive "round to nearest int first" bug would
// misclassify 1.9 as green and 0.9 as amber.
const SEQUENCES = {
  what: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],       // avg 2.0 -> green
  why: [2, 2, 2, 2, 2, 0, 0, 0, 0, 0],         // avg 1.0 -> amber (boundary)
  userFacing: [2, 2, 2, 2, 2, 2, 2, 2, 2, 1],  // avg 1.9 -> amber (not green)
  rightSized: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],  // avg 0.9 -> red (not amber)
  testability: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]  // avg 0.0 -> red, zeroPct 100
};

function buildAssessments() {
  const assessments = {};
  for (let i = 0; i < 10; i++) {
    assessments[`RHAIRFE-${i}`] = {
      rubricVersion: 'v2',
      scores: Object.fromEntries(Object.entries(SEQUENCES).map(([k, arr]) => [k, arr[i]]))
    };
  }
  return assessments;
}

describe('CriteriaBreakdownChart color mapping', () => {
  const wrapper = shallowMount(CriteriaBreakdownChart, { props: { assessments: buildAssessments() } });
  const chartData = wrapper.findComponent(Bar).props('data');
  const [avgDataset, zeroDataset] = chartData.datasets;

  it('computes the continuous per-criterion averages without integer rounding', () => {
    // CRITERIA order: what, why, userFacing, rightSized, testability
    expect(avgDataset.data).toEqual([2, 1, 1.9, 0.9, 0]);
  });

  it('colors an exact 2.0 average green', () => {
    expect(avgDataset.backgroundColor[0]).toBe(scoreRgba('green', 0.85));
    expect(avgDataset.borderColor[0]).toBe(SCORE_HEX.green);
  });

  it('colors the 1.0 boundary amber, not red', () => {
    expect(avgDataset.backgroundColor[1]).toBe(scoreRgba('amber', 0.85));
    expect(avgDataset.borderColor[1]).toBe(SCORE_HEX.amber);
  });

  it('colors a 1.9 average green (above the 1.75 floor for an averaged metric)', () => {
    expect(avgDataset.backgroundColor[2]).toBe(scoreRgba('green', 0.85));
    expect(avgDataset.borderColor[2]).toBe(SCORE_HEX.green);
  });

  it('colors a 0.9 average red, never rounding up to amber', () => {
    expect(avgDataset.backgroundColor[3]).toBe(scoreRgba('red', 0.85));
    expect(avgDataset.borderColor[3]).toBe(SCORE_HEX.red);
  });

  it('colors an exact 0 average red', () => {
    expect(avgDataset.backgroundColor[4]).toBe(scoreRgba('red', 0.85));
    expect(avgDataset.borderColor[4]).toBe(SCORE_HEX.red);
  });

  it('leaves Zero-Score % data and semantics unchanged (still the zero-fraction per criterion)', () => {
    expect(zeroDataset.label).toBe('Zero-Score %');
    expect(zeroDataset.data).toEqual([0, 50, 0, 10, 100]);
  });

  it('renders Zero-Score % as a point marker, not a grouped bar', () => {
    // A second grouped bar dataset makes Chart.js reserve a same-width slot
    // for it even when it's visually thin, which pushes the Avg Score bar
    // off-center within its category. A point dataset on its own axis draws
    // at the category's exact center regardless of bar-grouping width math.
    expect(zeroDataset.type).toBe('line');
    expect(zeroDataset.showLine).toBe(false);
  });

  it('keeps Zero-Score % visually distinct from a red Avg Score bar via a marker shape, not a new color', () => {
    expect(zeroDataset.borderColor).toBe(SCORE_HEX.red);
    expect(zeroDataset.backgroundColor).not.toBe(avgDataset.backgroundColor[4]);
  });

  it('renders the Zero-Score % marker hollow, so a 0% value sitting on the baseline still reads as an explicit ring rather than a missing point', () => {
    // Fill must NOT be a translucent/solid red — at 0% the marker sits on the
    // baseline gridline, and a red fill would visually merge into it.
    expect(zeroDataset.backgroundColor).not.toBe(scoreRgba('red', 0.15));
    expect(zeroDataset.borderWidth).toBeGreaterThanOrEqual(2);
  });

  it('reports the exact Zero-Score % in tooltips even when it is 0', () => {
    const options = wrapper.findComponent(Bar).props('options');
    const label = options.plugins.tooltip.callbacks.label({ datasetIndex: 1, raw: 0 });
    expect(label).toBe('Zero-score: 0%');
  });
});
