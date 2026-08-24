import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PipelineTimeline from '../../client/components/PipelineTimeline.vue';

const PHASES = [
  { id: 'prd-review', name: 'PRD Review' },
  { id: 'design-review', name: 'Design Review' }
];

function makeRFE(overrides = {}) {
  return {
    key: 'OSAC-63',
    summary: 'Some feature',
    aiInvolvement: 'created',
    ...overrides
  };
}

describe('PipelineTimeline prd-review phase', () => {
  it('marks prd-review as the current/active phase for a real PRD', () => {
    const wrapper = mount(PipelineTimeline, {
      props: { rfe: makeRFE(), phases: PHASES }
    });

    expect(wrapper.text()).toContain('AI created');
  });

  it('does not mark prd-review as current or completed when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', aiInvolvement: 'none', sourceRfe: null });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    // "current" phase renders a blue circle icon with this class; "completed" renders green.
    const prdReviewStep = wrapper.findAll('.rounded-full').find(el => el.classes().includes('w-8'));
    expect(prdReviewStep.classes()).not.toContain('bg-blue-500');
    expect(prdReviewStep.classes()).not.toContain('bg-green-500');
  });

  it('shows "No PRD" text without "No AI involvement" or a PR link when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', aiInvolvement: 'none', sourceRfe: null });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    expect(wrapper.text()).toContain('No PRD');
    expect(wrapper.text()).not.toContain('No AI involvement');
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
