import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, readonly } from 'vue'
import ReportsHub from '../../../client/reports/ReportsHub.vue'

// Replace the report `component` loaders with deterministic, instantly
// resolving stubs. The real registry renders reports via
// defineAsyncComponent(() => import(...)) through <component :is="...">,
// which has no registered name, so `global.stubs` keyed by name never
// matches it — the real dynamic import of the full .vue file runs instead,
// racing against test teardown. Metadata (titles, filters, hidden flags)
// stays real so catalog/filter assertions keep testing actual registry data.
vi.mock('../../../client/reports/registry', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    reports: actual.reports.map((report) => ({
      ...report,
      component: () => Promise.resolve({
        default: { template: `<div data-testid="${report.id}-report">${report.title}</div>` }
      }),
    })),
  }
})

const mockRosterTeams = ref([])

// Mock dependencies
vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    teams: mockRosterTeams,
    loadRoster: vi.fn(),
  })
}))

const mockNavigateTo = vi.fn()
const mockParams = ref({})

describe('ReportsHub', () => {
  let wrapper

  beforeEach(() => {
    mockRosterTeams.value = [{ key: 'flightctl::team-1', displayName: 'Flight Team', members: [] }]
  })

  afterEach(() => {
    // Unmounting stops each instance's reactivity; without this, every
    // instance stays subscribed to the shared `mockParams` ref and keeps
    // reacting (and re-triggering async component loads) on later tests'
    // param changes, including past the end of the test run.
    wrapper?.unmount()
  })

  function createWrapper(params = {}) {
    mockParams.value = params
    mockNavigateTo.mockClear()
    wrapper = mount(ReportsHub, {
      global: {
        provide: {
          moduleNav: {
            navigateTo: mockNavigateTo,
            goBack: vi.fn(),
            params: readonly(mockParams),
            moduleSlug: readonly(ref('team-tracker')),
          }
        }
      }
    })
    return wrapper
  }

  it('renders catalog with report cards when no report param', () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('[data-testid="report-card"]')
    expect(cards.length).toBe(2)
  })

  it('shows catalog title', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Reports')
    expect(wrapper.text()).toContain('Explore team metrics and trends')
  })

  it('calls navigateTo when a card is clicked', async () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('[data-testid="report-card"]')
    await cards[0].trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('reports', { report: 'trends' })
  })

  it('renders report shell when report param is present', async () => {
    const wrapper = createWrapper({ report: 'trends' })
    await flushPromises()
    expect(wrapper.find('[data-testid="report-shell-back"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Productivity Trends')
  })

  it('lands a retired report id (legacy allocation bookmark) on the catalog without error', async () => {
    const wrapper = createWrapper({ report: 'allocation' })
    await flushPromises()
    expect(wrapper.findAll('[data-testid="report-card"]').length).toBe(2)
    expect(wrapper.find('[data-testid="report-shell-back"]').exists()).toBe(false)
  })

  it('renders catalog when report param does not match any report', () => {
    const wrapper = createWrapper({ report: 'nonexistent' })
    expect(wrapper.findAll('[data-testid="report-card"]').length).toBe(2)
  })

  it('shows the team filter, and no organization filter, for Trends', async () => {
    const wrapper = createWrapper({ report: 'trends' })
    await flushPromises()
    expect(wrapper.find('[aria-label="Organization filter"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Team filter"]').exists()).toBe(true)
  })

  it('shows the team filter for Team Comparison', async () => {
    const wrapper = createWrapper({ report: 'team-comparison' })
    await flushPromises()
    expect(wrapper.find('[aria-label="Team filter"]').exists()).toBe(true)
  })
})
