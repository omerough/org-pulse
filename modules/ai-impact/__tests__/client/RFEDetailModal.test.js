import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({})
}));

import { mount } from '@vue/test-utils';
import RFEDetailModal from '../../client/components/RFEDetailModal.vue';

const PHASES = [
  { id: 'prd-review', name: 'PRD Review' },
  { id: 'design-review', name: 'Design Review' }
];

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

// RFEDetailModal renders via <Teleport to="body">, so assert against document.body
// rather than the wrapper's own (empty) root element.
function mountModal(rfe, assessment = null) {
  return mount(RFEDetailModal, {
    props: { show: true, rfe, phases: PHASES, assessment },
    attachTo: document.body
  });
}

describe('RFEDetailModal', () => {
  it('renders Author/Created/AI Involvement fields for a real PRD', () => {
    const wrapper = mountModal(makeRFE());

    expect(document.body.textContent).toContain('Author');
    expect(document.body.textContent).toContain('Alice');
    expect(document.body.textContent).toContain('AI Involvement');
    expect(document.body.textContent).toContain('Not yet assessed');
    wrapper.unmount();
  });

  it('shows a missing-PRD state instead of Author/Created/AI Involvement when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('No PRD has been verified for this feature.');
    expect(document.body.textContent).not.toContain('Author');
    expect(document.body.textContent).not.toContain('AI Involvement');
    expect(document.body.textContent).not.toContain('No AI');
    wrapper.unmount();
  });

  it('shows a no-PRD assessment placeholder instead of "Not yet assessed" when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('No PRD to assess');
    expect(document.body.textContent).not.toContain('Not yet assessed');
    wrapper.unmount();
  });

  it('does not show a stale score when status is No PR even if an assessment is passed in', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe, { passFail: 'PASS', total: 9 });

    expect(document.body.textContent).toContain('No PRD to assess');
    expect(document.body.textContent).not.toContain('9/10');
    wrapper.unmount();
  });

  it('does not throw or render an invalid/1970 date when created is null', () => {
    const rfe = makeRFE({ status: 'No PR', created: null, creatorDisplayName: null, sourceRfe: null, aiInvolvement: 'none' });

    let wrapper;
    expect(() => { wrapper = mountModal(rfe); }).not.toThrow();
    expect(document.body.textContent).not.toContain('1970');
    wrapper.unmount();
  });

  it('titles the modal "PRD Details" for a real PRD', () => {
    const wrapper = mountModal(makeRFE());

    expect(document.body.querySelector('h2').textContent).toBe('PRD Details');
    wrapper.unmount();
  });

  it('titles the modal "Feature Details", not "Missing PRD", when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.querySelector('h2').textContent).toBe('Feature Details');
    wrapper.unmount();
  });
});
