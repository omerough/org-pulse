import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, readonly } from 'vue'
import AllocationReport from '../../../client/reports/AllocationReport.vue'

const mockOrgs = ref([{ name: 'AI Platform' }, { name: 'Core' }])
const mockLoadOrgs = vi.fn()

vi.mock('../../../client/composables/useOrgRoster', () => ({
  useOrgRoster: () => ({
    orgs: mockOrgs,
    loadOrgs: mockLoadOrgs,
  })
}))

vi.mock('../../../client/composables/useAllocationStrategy', () => ({
  useAllocationStrategy: () => ({
    categories: {
      value: [
        { key: 'tech-debt-quality', name: 'Tech Debt & Quality', color: 'amber', target: 40 },
        { key: 'new-features', name: 'New Features', color: 'blue', target: 40 },
        { key: 'learning-enablement', name: 'Learning & Enablement', color: 'green', target: 20 }
      ]
    }
  })
}))

const mockSummary = {
  totalPoints: 100,
  totalCount: 20,
  teamCount: 3,
  boardCount: 5,
  estimatedIssueCount: 15,
  unestimatedIssueCount: 5,
  buckets: {
    'tech-debt-quality': { points: 40, count: 8 },
    'new-features': { points: 40, count: 8 },
    'learning-enablement': { points: 20, count: 4 },
    'uncategorized': { points: 0, count: 0 },
  },
  teams: [
    {
      teamId: 't1',
      teamName: 'Model Serving',
      totalPoints: 50,
      totalCount: 10,
      boardCount: 2,
      percentages: { 'tech-debt-quality': 40, 'new-features': 40, 'learning-enablement': 20 },
      buckets: {
        'tech-debt-quality': { points: 20, count: 4 },
        'new-features': { points: 20, count: 4 },
        'learning-enablement': { points: 10, count: 2 },
        'uncategorized': { points: 0, count: 0 },
      },
    }
  ]
}

vi.mock('../../../client/services/allocation-api', () => ({
  getOrgAllocationSummary: vi.fn(async () => mockSummary),
  getGlobalAllocationSummary: vi.fn(async () => mockSummary),
}))

describe('AllocationReport', () => {
  const mockNavigateTo = vi.fn()

  let mountedWrappers = []

  beforeEach(() => {
    vi.clearAllMocks()
    setProject('')
  })

  afterEach(() => {
    mountedWrappers.forEach(w => w.unmount())
    mountedWrappers = []
    setProject('')
  })

  // Drives the real useProjectId the way the shell does: hash plus urlchange.
  function setProject(projectId) {
    window.location.hash = projectId ? `#/team-tracker/reports?report=allocation&projectId=${projectId}` : '#/team-tracker/reports?report=allocation'
    window.dispatchEvent(new Event('urlchange'))
  }

  function createWrapper() {
    const wrapper = mountReport()
    mountedWrappers.push(wrapper)
    return wrapper
  }

  function mountReport() {
    return mount(AllocationReport, {
      global: {
        provide: {
          moduleNav: {
            navigateTo: mockNavigateTo,
            goBack: vi.fn(),
            params: readonly(ref({})),
            moduleSlug: readonly(ref('team-tracker')),
          }
        },
        stubs: {
          AllocationBar: { template: '<div data-testid="allocation-bar">Bar</div>', props: ['buckets', 'totalPoints', 'totalCount', 'metricMode'] },
          AllocationTeamCard: { template: '<div data-testid="allocation-team-card" @click="$emit(\'click\')">{{ teamName }}</div>', props: ['teamName', 'totalPoints', 'totalCount', 'boardCount', 'percentages', 'buckets', 'metricMode', 'clickable'], emits: ['click'] },
          MetricToggle: { template: '<div data-testid="metric-toggle">Toggle</div>', props: ['modelValue'], emits: ['update:modelValue'] },
          OrgSelector: { template: '<div data-testid="org-selector">Orgs</div>', props: ['orgs', 'modelValue'], emits: ['select'] },
        }
      }
    })
  }

  it('fetches global summary on mount', async () => {
    const { getGlobalAllocationSummary } = await import('../../../client/services/allocation-api')
    createWrapper()
    await flushPromises()
    expect(getGlobalAllocationSummary).toHaveBeenCalled()
  })

  it('renders allocation bar when data is available', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="allocation-bar"]').exists()).toBe(true)
  })

  it('renders team cards', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    const cards = wrapper.findAll('[data-testid="allocation-team-card"]')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('Model Serving')
  })

  it('renders stat cards including estimated/unestimated', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Estimated')
    expect(text).toContain('Unestimated')
  })

  it('renders metric toggle', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="metric-toggle"]').exists()).toBe(true)
  })

  it('renders org selector when multiple orgs', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-testid="org-selector"]').exists()).toBe(true)
  })

  it('does not navigate to Team View when a team card is clicked', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    const card = wrapper.find('[data-testid="allocation-team-card"]')
    await card.trigger('click')
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  describe.each(['flight-control', 'osac'])('in project context %s', (projectId) => {
    it('shows the unavailable state and issues no legacy requests on a direct deep link', async () => {
      const { getGlobalAllocationSummary, getOrgAllocationSummary } = await import('../../../client/services/allocation-api')
      setProject(projectId)
      const wrapper = createWrapper()
      await flushPromises()
      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="allocation-bar"]').exists()).toBe(false)
      expect(getGlobalAllocationSummary).not.toHaveBeenCalled()
      expect(getOrgAllocationSummary).not.toHaveBeenCalled()
      expect(mockLoadOrgs).not.toHaveBeenCalled()
    })
  })

  it('stays unavailable and issues no requests when the project changes', async () => {
    const { getGlobalAllocationSummary } = await import('../../../client/services/allocation-api')
    setProject('flight-control')
    const wrapper = createWrapper()
    await flushPromises()
    setProject('osac')
    await flushPromises()
    expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(true)
    expect(getGlobalAllocationSummary).not.toHaveBeenCalled()
    expect(mockLoadOrgs).not.toHaveBeenCalled()
  })

  it('loads the legacy allocation data once the project is cleared', async () => {
    const { getGlobalAllocationSummary } = await import('../../../client/services/allocation-api')
    setProject('flight-control')
    const wrapper = createWrapper()
    await flushPromises()
    setProject('')
    await flushPromises()
    expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(false)
    expect(getGlobalAllocationSummary).toHaveBeenCalledTimes(1)
    expect(mockLoadOrgs).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="allocation-bar"]').exists()).toBe(true)
  })
})
