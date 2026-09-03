import { describe, it, expect } from 'vitest';
import { SCORE_HEX, scoreRgba, bandForCriterionAvg } from '../../client/utils/score-colors.js';

describe('bandForCriterionAvg', () => {
  it('maps an exact 2.0 average to green', () => {
    expect(bandForCriterionAvg(2)).toBe('green');
  });

  it('maps 1.95 to green (strong performance, not amber)', () => {
    expect(bandForCriterionAvg(1.95)).toBe('green');
  });

  it('maps 1.79 to green (above the 1.75 floor)', () => {
    expect(bandForCriterionAvg(1.79)).toBe('green');
  });

  it('maps the exact 1.75 boundary to green', () => {
    expect(bandForCriterionAvg(1.75)).toBe('green');
  });

  it('maps just below 1.75 to amber, never rounding up to green', () => {
    expect(bandForCriterionAvg(1.749)).toBe('amber');
  });

  it('maps the 1.0 boundary to amber, not red', () => {
    expect(bandForCriterionAvg(1)).toBe('amber');
  });

  it('maps just below 1.0 to red, never rounding up to amber', () => {
    expect(bandForCriterionAvg(0.999)).toBe('red');
  });

  it('maps an exact 0 average to red', () => {
    expect(bandForCriterionAvg(0)).toBe('red');
  });
});

describe('scoreRgba / SCORE_HEX', () => {
  it('exposes the PRD detail semantic hex tokens (green-500/amber-500/red-500)', () => {
    expect(SCORE_HEX).toEqual({ green: '#22c55e', amber: '#f59e0b', red: '#ef4444' });
  });

  it('builds an rgba string with the requested alpha for each band', () => {
    expect(scoreRgba('green', 0.7)).toBe('rgba(34, 197, 94, 0.7)');
    expect(scoreRgba('amber', 0.7)).toBe('rgba(245, 158, 11, 0.7)');
    expect(scoreRgba('red', 0.12)).toBe('rgba(239, 68, 68, 0.12)');
  });
});
