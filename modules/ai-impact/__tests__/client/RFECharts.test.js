import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import RFECharts from '../../client/components/RFECharts.vue';
import ScoreDistributionChart from '../../client/components/ScoreDistributionChart.vue';
import CriteriaBreakdownChart from '../../client/components/CriteriaBreakdownChart.vue';

const ASSESSMENTS = {
  'RHAIRFE-1': { rubricVersion: 'v2', total: 8, scores: { what: 2, why: 2, userFacing: 2, rightSized: 2, testability: 2 } }
};

describe('RFECharts (PRD Score Insights section)', () => {
  it('renders the "Score Insights" section heading, matching the Design Review pattern', () => {
    const wrapper = shallowMount(RFECharts, { props: { assessments: ASSESSMENTS } });
    expect(wrapper.text()).toContain('Score Insights');
  });

  it('passes assessments through to both PRD score charts', () => {
    const wrapper = shallowMount(RFECharts, { props: { assessments: ASSESSMENTS } });
    expect(wrapper.findComponent(ScoreDistributionChart).props('assessments')).toStrictEqual(ASSESSMENTS);
    expect(wrapper.findComponent(CriteriaBreakdownChart).props('assessments')).toStrictEqual(ASSESSMENTS);
  });

  it('renders nothing when there are no assessments to chart', () => {
    const wrapper = shallowMount(RFECharts, { props: { assessments: {} } });
    expect(wrapper.find('div').exists()).toBe(false);
  });

  it('toggles the section closed on header click', async () => {
    const wrapper = shallowMount(RFECharts, { props: { assessments: ASSESSMENTS } });
    expect(wrapper.findComponent(ScoreDistributionChart).exists()).toBe(true);
    await wrapper.find('button').trigger('click');
    expect(wrapper.findComponent(ScoreDistributionChart).exists()).toBe(false);
  });
});
