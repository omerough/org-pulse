import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))

// Index-entry shapes below mirror the producer contract (executionIssueCount /
// doneExecutionIssueCount / executionState / executionCoverage /
// preparationReadiness), covering each of the four known execution states plus
// both unavailable causes (epics-with-no-issues vs. fully missing metrics).
const FEATURES = [
  {
    key: 'COMPLETE-1', summary: 'Complete feature', status: 'Done', statusCategory: 'Done',
    fixVersions: ['1.0'], components: ['Comp A'], epicCount: 1, issueCount: 2, blockerCount: 0,
    executionIssueCount: 2, doneExecutionIssueCount: 2, executionState: 'complete', executionCoverage: 'available',
    preparationReadiness: 'ready'
  },
  {
    key: 'NS-1', summary: 'Not started feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], epicCount: 1, issueCount: 3, blockerCount: 0,
    executionIssueCount: 2, doneExecutionIssueCount: 0, executionState: 'not-started', executionCoverage: 'available',
    preparationReadiness: 'pending'
  },
  {
    key: 'IP-1', summary: 'In progress feature', status: 'In Progress', statusCategory: 'In Progress',
    fixVersions: ['2.0'], components: ['Comp B'], epicCount: 1, issueCount: 2, blockerCount: 2,
    executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
    preparationReadiness: 'unknown'
  },
  {
    key: 'EMPTY-1', summary: 'Genuinely empty feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], epicCount: 0, issueCount: 0, blockerCount: 0,
    executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'no-tracked-work', executionCoverage: 'empty',
    preparationReadiness: 'not-applicable'
  },
  {
    key: 'EMPTY-2', summary: 'Preparation-only feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
    executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'no-tracked-work', executionCoverage: 'empty',
    preparationReadiness: 'not-applicable'
  },
  {
    key: 'NODATA-1', summary: 'Epics with no observed issues', status: 'In Progress', statusCategory: 'In Progress',
    fixVersions: ['2.0'], components: [], epicCount: 9, issueCount: 0, blockerCount: 0,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: null, executionCoverage: 'insufficient-data',
    preparationReadiness: 'not-applicable'
  },
  {
    key: 'NODATA-2', summary: 'Missing metrics feature', status: 'New', statusCategory: null,
    fixVersions: [], components: [], epicCount: 0, issueCount: 0, blockerCount: 0,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: null, executionCoverage: 'insufficient-data',
    preparationReadiness: 'unknown'
  }
]

function mockNav() {
  return { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({}) }
}

async function mountWithData() {
  mockApiRequest.mockImplementation((url) => {
    if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['1.0', '2.0'] })
    return Promise.resolve({ features: FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: FEATURES.length })
  })
  const nav = mockNav()
  const wrapper = mount(OverviewView, { global: { provide: { moduleNav: nav } } })
  await flushPromises()
  return { wrapper, nav }
}

describe('OverviewView (Feature List)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    sessionStorage.clear()
  })

  it('defaults to Board view with the four known lanes plus a distinct unavailable group, losing no features', async () => {
    const { wrapper } = await mountWithData()

    const laneTitles = wrapper.findAll('h3').map(h => h.text())
    expect(laneTitles).toEqual([
      'No Tracked Work', 'Not Started', 'In Progress', 'Complete', 'Execution Data Unavailable'
    ])

    for (const f of FEATURES) {
      expect(wrapper.text()).toContain(f.key)
    }
  })

  it('never buckets unavailable-state features into No Tracked Work', async () => {
    const { wrapper } = await mountWithData()
    const noTrackedSection = wrapper.findAll('.rounded-lg.border.overflow-hidden')
      .find(el => el.text().includes('No Tracked Work'))
    expect(noTrackedSection.text()).not.toContain('NODATA-1')
    expect(noTrackedSection.text()).not.toContain('NODATA-2')
  })

  it('distinguishes real 0%, empty scope (with and without preparation-only issues), and insufficient data', async () => {
    const { wrapper } = await mountWithData()
    const text = wrapper.text()

    expect(text).toContain('No tracked execution work')
    expect(text).toContain('Preparation work only')
    expect(text).toContain('9 epics')
    expect(text).toContain('No issue-level progress available')
    expect(text).toContain('Execution data unavailable')
    // Real nonzero all-To-Do scope shows 0%, not blank/unavailable
    expect(text).toContain('0/2')
  })

  it('renders "available" coverage with invalid counts as unavailable, never a fabricated/NaN/clamped percentage', async () => {
    const badFeatures = [
      { key: 'BAD-ZERO', summary: 'Zero total', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-NULL', summary: 'Null counts', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-OVERFLOW', summary: 'Done exceeds total', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 3, doneExecutionIssueCount: 5, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-FLOAT', summary: 'Non-integer counts', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 4.5, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' }
    ]
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: [] })
      return Promise.resolve({ features: badFeatures, fetchedAt: '2026-09-10T00:00:00Z', featureCount: badFeatures.length })
    })
    const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toMatch(/NaN/)
    expect(text).not.toContain('0%')
    const unavailableCount = (text.match(/Execution data unavailable/g) || []).length
    expect(unavailableCount).toBe(badFeatures.length)
  })

  it('shows preparation readiness independent of execution progress', async () => {
    const { wrapper } = await mountWithData()
    const text = wrapper.text()
    expect(text).toContain('Ready')
    expect(text).toContain('Pending')
    expect(text).toContain('Unknown')
    expect(text).toContain('N/A')
  })

  it('renders neutral progress without health/status-color badges', async () => {
    const { wrapper } = await mountWithData()
    const html = wrapper.html()
    expect(html).not.toMatch(/Status color missing/)
    expect(wrapper.findComponent({ name: 'SignoffBadge' }).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/\bRED\b|\bYELLOW\b|\bGREEN\b/)
  })

  it('switches to List view exposing the same filtered population with the specified columns', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const headers = wrapper.findAll('th').map(h => h.text())
    expect(headers).toEqual([
      'Key', 'Summary', 'Jira Status', 'Execution State', 'Progress',
      'Preparation', 'Epics', 'Issues', 'Attention', 'Components', 'Version'
    ])

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(FEATURES.length)
    expect(wrapper.text()).toContain('2/2')
    expect(wrapper.text()).toContain('100%')
  })

  it('filters by Execution State including the unavailable option', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const executionStateButton = wrapper.findAll('button').find(b => b.text().includes('All Execution States'))
    await executionStateButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Execution Data Unavailable')
    await option.find('input[type="checkbox"]').setValue(true)

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('NODATA-1')
    expect(wrapper.text()).toContain('NODATA-2')
    expect(wrapper.text()).not.toContain('COMPLETE-1')
  })

  it('filters by multi-component selection including Unassigned', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const componentButton = wrapper.findAll('button').find(b => b.text().includes('All components'))
    await componentButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Comp A')
    await option.find('input[type="checkbox"]').setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('COMPLETE-1')
  })

  it('filters by Jira Status (statusCategory), preserving Unknown for missing values', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const statusButton = wrapper.findAll('button').find(b => b.text().includes('All statuses'))
    await statusButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Unknown')
    await option.find('input[type="checkbox"]').setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('NODATA-2')
  })

  it('filters to Blockers-only attention', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const attentionToggle = wrapper.findAll('label').find(l => l.text() === 'Blockers only').find('input[type="checkbox"]')
    await attentionToggle.setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('IP-1')
  })

  it('preserves detail navigation on card click', async () => {
    const { wrapper, nav } = await mountWithData()
    const card = wrapper.findAll('.cursor-pointer').find(el => el.text().includes('COMPLETE-1'))
    await card.trigger('click')
    expect(nav.navigateTo).toHaveBeenCalledWith('feature-detail', { key: 'COMPLETE-1' })
  })
})
