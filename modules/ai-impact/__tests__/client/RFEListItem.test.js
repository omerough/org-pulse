import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RFEListItem from '../../client/components/RFEListItem.vue';

function makeRFE(overrides = {}) {
  return {
    key: 'OSAC-63',
    summary: 'Some feature',
    priority: 'Major',
    status: 'New',
    created: '2026-01-01T00:00:00.000Z',
    creatorDisplayName: 'Alice',
    aiInvolvement: 'created',
    ...overrides
  };
}

describe('RFEListItem', () => {
  it('renders normal AI involvement badge and metadata for a real PRD', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE() } });

    expect(wrapper.text()).toContain('AI Created');
    expect(wrapper.text()).toContain('Author');
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Created');
    expect(wrapper.text()).not.toContain('Missing PRD');
  });

  it('shows a Missing PRD badge instead of the AI involvement badge when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).toContain('Missing PRD');
    expect(wrapper.text()).not.toContain('No AI');
  });

  it('does not render Author or Created chips when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Author');
    expect(wrapper.text()).not.toContain('Created');
  });

  it('does not throw on a null created date when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', created: null, creatorDisplayName: null, aiInvolvement: 'none' });

    expect(() => mount(RFEListItem, { props: { rfe } })).not.toThrow();
  });

  it('does not show a score for a No PR row even when a stale assessment is passed in', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const assessment = { passFail: 'PASS', total: 9 };
    const wrapper = mount(RFEListItem, { props: { rfe, assessment } });

    expect(wrapper.text()).not.toContain('Score');
    expect(wrapper.text()).not.toContain('9/10');
  });

  it('shows Approved sign-off when the PRD PR is Merged', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Merged' }) } });

    expect(wrapper.text()).toContain('Approved');
  });

  it('shows Awaiting Sign-off when the PRD PR is Open', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Open' }) } });

    expect(wrapper.text()).toContain('Awaiting Sign-off');
  });

  it('shows Awaiting Sign-off when the PRD PR is Closed without merge', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Closed' }) } });

    expect(wrapper.text()).toContain('Awaiting Sign-off');
  });

  it('does not show a sign-off badge for a Missing PRD row', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Approved');
    expect(wrapper.text()).not.toContain('Awaiting Sign-off');
  });
});
