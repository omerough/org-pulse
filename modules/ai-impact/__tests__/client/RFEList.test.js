import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RFEList from '../../client/components/RFEList.vue';

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
