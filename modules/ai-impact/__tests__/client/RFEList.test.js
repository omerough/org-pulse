import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RFEList from '../../client/components/RFEList.vue';
import RFEListItem from '../../client/components/RFEListItem.vue';

function makeRFE(overrides = {}) {
  return {
    key: 'RHAIRFE-1',
    summary: 'Some RFE',
    priority: 'Major',
    status: 'New',
    created: '2026-01-01',
    components: [],
    ...overrides
  };
}

describe('RFEList component filter', () => {
  const rfes = [
    makeRFE({ key: 'RHAIRFE-1', summary: 'Core work', components: ['Core'] }),
    makeRFE({ key: 'RHAIRFE-2', summary: 'Storage work', components: ['Storage'] }),
    makeRFE({ key: 'RHAIRFE-3', summary: 'No component', components: [] })
  ];

  it('defaults to All Components and shows every RFE', () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.findAll('option').some(o => o.text() === 'All Components'));
    expect(componentSelect.find('option[value="all"]').text()).toBe('All Components');
    expect(wrapper.text()).toContain('3 of 3 total');
  });

  it('lists unique components derived from the data, sorted', () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    const options = componentSelect.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Components', 'Core', 'Storage']);
  });

  it('filters to only RFEs matching the selected component', async () => {
    const wrapper = mount(RFEList, { props: { rfes, componentFilter: 'Core' } });
    expect(wrapper.text()).toContain('1 of 3 total');
    expect(wrapper.text()).toContain('Core work');
    expect(wrapper.text()).not.toContain('Storage work');
  });

  it('emits update:componentFilter when a component is selected', async () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    await componentSelect.setValue('Storage');
    expect(wrapper.emitted('update:componentFilter')[0]).toEqual(['Storage']);
  });

  it('restores the full list when switched back to All Components', async () => {
    const filtered = mount(RFEList, { props: { rfes, componentFilter: 'Core' } });
    expect(filtered.text()).toContain('1 of 3 total');

    await filtered.setProps({ componentFilter: 'all' });
    expect(filtered.text()).toContain('3 of 3 total');
  });
});

describe('RFEList default ordering', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(RFEListItem).map(c => c.props('rfe').key);
  }

  it('puts verified-PRD rows before missing-PRD rows, each sorted by numeric OSAC id descending', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'No PR' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' }),
      makeRFE({ key: 'OSAC-983', status: 'No PR' }),
      makeRFE({ key: 'OSAC-100', status: 'New' })
    ];

    const wrapper = mount(RFEList, { props: { rfes, sortBy: 'default' } });

    expect(renderedKeys(wrapper)).toEqual(['OSAC-4000', 'OSAC-100', 'OSAC-983', 'OSAC-63']);
  });

  it('uses numeric comparison, not lexical string sorting, within a group', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'New' }),
      makeRFE({ key: 'OSAC-983', status: 'New' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' })
    ];

    const wrapper = mount(RFEList, { props: { rfes, sortBy: 'default' } });

    // Lexical sort would produce ['OSAC-983', 'OSAC-4000', 'OSAC-63'] (string comparison)
    expect(renderedKeys(wrapper)).toEqual(['OSAC-4000', 'OSAC-983', 'OSAC-63']);
  });

  it('does not affect explicit Score sort options', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'No PR' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' })
    ];
    const assessments = {
      'OSAC-63': { total: 2 },
      'OSAC-4000': { total: 8 }
    };

    const ascending = mount(RFEList, { props: { rfes, assessments, sortBy: 'score-asc' } });
    expect(renderedKeys(ascending)).toEqual(['OSAC-63', 'OSAC-4000']);

    const descending = mount(RFEList, { props: { rfes, assessments, sortBy: 'score-desc' } });
    expect(renderedKeys(descending)).toEqual(['OSAC-4000', 'OSAC-63']);
  });
});
