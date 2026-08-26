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
  it('renders normal AI involvement badge and glanceable metadata for a real PRD', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE() } });

    expect(wrapper.text()).toContain('AI Created');
    expect(wrapper.text()).toContain('Priority');
    expect(wrapper.text()).toContain('Score');
    expect(wrapper.text()).not.toContain('Missing PRD');
  });

  it('prefixes the Created & Revised provenance value with AI so the axis is explicit', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'both' }) } });

    expect(wrapper.text()).toContain('AI Created & Revised');
  });

  it('labels no AI involvement as AI N/A on a real PRD', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'none' }) } });

    expect(wrapper.text()).toContain('AI N/A');
  });

  it('gives AI Created a teal pill distinct from neutral metadata pills', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'created' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Created');
    expect(aiPill.classes()).toContain('bg-teal-100');
    expect(aiPill.classes()).toContain('text-teal-800');

    const priorityPill = wrapper.findAll('span').find(el => el.text().startsWith('Priority'));
    expect(priorityPill.classes()).not.toContain('bg-teal-100');
  });

  it('gives AI Created & Revised a green pill distinct from the teal AI Created pill', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'both' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Created & Revised');
    expect(aiPill.classes()).toContain('bg-green-100');
    expect(aiPill.classes()).toContain('text-green-800');
    expect(aiPill.classes()).not.toContain('bg-teal-100');
  });

  it('gives AI Revised an amber pill', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'revised' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Revised');
    expect(aiPill.classes()).toContain('bg-amber-100');
    expect(aiPill.classes()).toContain('text-amber-800');
  });

  it('falls back to a neutral AI pill when there is no AI involvement', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'none' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI N/A');
    expect(aiPill.classes()).toContain('bg-gray-100');
    expect(aiPill.classes()).not.toContain('bg-green-100');
    expect(aiPill.classes()).not.toContain('bg-teal-100');
  });

  it('does not show Author or Created date in the list for a real PRD', () => {
    const rfe = makeRFE();
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Author');
    expect(wrapper.text()).not.toContain('Alice');
    expect(wrapper.text()).not.toContain(new Date(rfe.created).toLocaleDateString());
  });

  it('shows a Missing PRD badge instead of the AI involvement badge when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).toContain('Missing PRD');
    expect(wrapper.text()).not.toContain('No AI');
  });

  it('gives the Missing PRD pill the same blue treatment as Design Review No Design', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    const pill = wrapper.findAll('span').find(el => el.text() === 'Missing PRD');
    expect(pill.classes()).toContain('bg-blue-100');
    expect(pill.classes()).toContain('text-blue-800');
    expect(pill.classes()).toContain('rounded-full');
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

  it('shows a Review Approved badge when the PRD PR is Merged', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Merged' }) } });

    expect(wrapper.text()).toContain('Review Approved');
  });

  it('shows a Review Awaiting Sign-off badge when the PRD PR is Open', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Open' }) } });

    expect(wrapper.text()).toContain('Review Awaiting Sign-off');
  });

  it('shows a Review Awaiting Sign-off badge when the PRD PR is Closed without merge', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Closed' }) } });

    expect(wrapper.text()).toContain('Review Awaiting Sign-off');
  });

  it('keeps the AI provenance badge distinct from the review status badge', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Merged', aiInvolvement: 'revised' }) } });

    expect(wrapper.text()).toContain('AI Revised');
    expect(wrapper.text()).toContain('Review Approved');
  });

  it('does not show a review status badge for a Missing PRD row', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Approved');
    expect(wrapper.text()).not.toContain('Awaiting Sign-off');
    expect(wrapper.text()).not.toContain('Review');
  });
});
