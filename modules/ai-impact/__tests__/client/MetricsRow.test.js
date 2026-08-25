import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MetricsRow from '../../client/components/MetricsRow.vue';

const METRICS = { createdPct: 50, createdChange: 0, trend: 'stable', revisedCount: 2, priorRevisedCount: 1, windowTotal: 4, totalRFEs: 10 };

function makeRFE(overrides = {}) {
  return { key: 'OSAC-1', status: 'Merged', ...overrides };
}

function signedOffTileText(wrapper) {
  const tile = wrapper.findAll('.space-y-1').find(el => el.text().includes('Signed Off'));
  return tile.find('span').text();
}

describe('MetricsRow Signed Off metric', () => {
  it('counts only Merged verified PRDs as Signed Off', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'Open' }),
      makeRFE({ key: 'OSAC-3', status: 'Closed' }),
      makeRFE({ key: 'OSAC-4', status: 'Merged' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('2');
  });

  it('excludes No PR rows from the Signed Off count', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' }),
      makeRFE({ key: 'OSAC-3', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('1');
  });

  it('shows zero Signed Off when no PRDs are Merged', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Open' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('0');
  });
});
