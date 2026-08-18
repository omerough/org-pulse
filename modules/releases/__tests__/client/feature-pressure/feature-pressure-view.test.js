/**
 * Feature Pressure must drop visible RHAISTRAT/RHAIRFE wording and
 * must not render the RFE Pipeline section/header when there is no RFE data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeaturePressureView from '../../../client/views/FeaturePressureView.vue'

var mockApiRequest = vi.fn()

vi.mock('@shared/client', function () {
  return {
    apiRequest: function () { return mockApiRequest.apply(null, arguments) },
  }
})

vi.mock('vue-chartjs', () => ({
  Bar: { name: 'Bar', props: ['data', 'options'], template: '<canvas></canvas>' },
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale',
  BarElement: 'BarElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend',
}))

function baseSummary() {
  return {
    total_features: 10, total_features_jql: '',
    open_features: 4, open_features_jql: '',
    created_in_window: 5, created_in_window_jql: '',
    resolved_in_window: 3, resolved_in_window_jql: '',
    net_in_window: 2,
    monthly_burn_rate: 1.5,
    months_to_clear: 4,
    backlog_trend: 'stable',
    total_rfes: 8, total_rfes_jql: '',
    rfe_pending: 2, rfe_pending_jql: '',
    rfe_accepted: 5, rfe_accepted_jql: '',
    trend_improving: 1, trend_worsening: 1, trend_stable: 1,
  }
}

function makeTestData(rfePipeline) {
  return {
    metadata: { data_timestamp: '2026-08-01T00:00:00Z', total_features: 10, total_rfes: 8 },
    executive_summary: baseSummary(),
    monthly_flow: [],
    rfe_pipeline: rfePipeline,
    backlog_half_life: [],
    heatmap: { months: [], components: [], matrix: [] },
    scorecard: [],
  }
}

async function mountView(rfePipeline) {
  mockApiRequest.mockReset()
  mockApiRequest.mockImplementation(() => Promise.resolve(makeTestData(rfePipeline)))
  const wrapper = mount(FeaturePressureView, {
    global: {
      stubs: {
        ClickableCount: { template: '<span>{{ count }}</span>', props: ['count', 'jql', 'color'] },
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('FeaturePressureView RHAI wording', () => {
  beforeEach(() => mockApiRequest.mockReset())

  it('does not render RHAISTRAT or RHAIRFE anywhere in visible text', async () => {
    const wrapper = await mountView({
      status_breakdown: {
        total: { count: 8, jql: '' },
        accepted: { count: 5, jql: '' },
        pending: { count: 2, jql: '' },
        other: { count: 1 },
      },
      per_component_pending: [],
    })
    expect(wrapper.text()).not.toMatch(/RHAISTRAT/)
    expect(wrapper.text()).not.toMatch(/RHAIRFE/)
  })
})

describe('FeaturePressureView RFE Pipeline section', () => {
  beforeEach(() => mockApiRequest.mockReset())

  it('renders the RFE Pipeline section when data is present', async () => {
    const wrapper = await mountView({
      status_breakdown: {
        total: { count: 8, jql: '' },
        accepted: { count: 5, jql: '' },
        pending: { count: 2, jql: '' },
        other: { count: 1 },
      },
      per_component_pending: [],
    })
    expect(wrapper.text()).toContain('PRD Pipeline')
  })

  it('does not render the RFE Pipeline section/header when there is no applicable data', async () => {
    const wrapper = await mountView(null)
    expect(wrapper.text()).not.toContain('PRD Pipeline')
  })
})
