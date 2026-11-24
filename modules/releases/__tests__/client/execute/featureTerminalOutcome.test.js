import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'

const mockApiRequest = vi.fn()
vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))
vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ user: ref({}) })
}))
vi.mock('../../../client/execute/composables/useFeatureTraffic', async importOriginal => ({
  ...(await importOriginal()),
  useFeatureDetail: () => ({
    feature: ref(null), loading: ref(false), error: ref(null), loadFeature: vi.fn()
  })
}))
vi.mock('../../../client/execute/composables/useAIReview.js', () => ({
  useAIReview: () => ({
    aiReview: ref(null), aiReviewLoading: ref(false), aiReviewError: ref(null), loadAIReview: vi.fn()
  })
}))

const POLICY = {
  terminalOutcomeProfile: { completed: ['Done'], nonDelivery: ["Won't Do", 'Duplicate'] },
  closedFeatureVisibility: 'all'
}

function feature(key, status, statusCategory, state, { resolution = null, outcome, versions = [] } = {}) {
  return {
    key, summary: `Summary ${key}`, status, statusCategory, fixVersions: versions, components: [], labels: [],
    epicCount: 0, issueCount: null, blockerCount: null,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
    executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
    preparationReadiness: 'unknown',
    workStatus: { source: 'jira-feature-status', state },
    resolution: resolution && { id: resolution, name: resolution },
    ...(outcome === undefined ? {} : { terminalOutcome: outcome && { source: 'jira-resolution', state: outcome } }),
    coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
  }
}

const closed = (key, resolution, outcome, versions = []) =>
  feature(key, 'Closed', 'Done', 'done', { resolution, outcome, versions })

const FEATURES = [
  feature('F-TODO', 'To Do', 'To Do', 'not-started', { outcome: null }),
  feature('F-ACTIVE', 'In Progress', 'In Progress', 'in-progress', { outcome: null, versions: ['1.0.0'] }),
  closed('F-DONE', 'Done', 'completed'),
  closed('F-DONE-1', 'Done', 'completed', ['1.0.0']),
  closed('F-WONT', "Won't Do", 'non-delivery'),
  closed('F-DUP', 'Duplicate', 'non-delivery', ['1.0.0']),
  closed('F-UNKNOWN', 'Fixed', 'unknown'),
  closed('F-NORES', null, 'unknown')
]

async function mountOverview(features, extras = POLICY, storedFilters = null) {
  window.location.hash = '#/releases/execute?projectId=flightctl'
  window.dispatchEvent(new Event('urlchange'))
  if (storedFilters) sessionStorage.setItem('releases:feature-list-filters:flightctl', JSON.stringify(storedFilters))
  mockApiRequest.mockImplementation(url => {
    if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', versions: ['1.0.0'] })
    return Promise.resolve({
      projectId: 'flightctl', state: 'supported', partial: false, features, featureCount: features.length, ...extras
    })
  })
  const wrapper = mount(OverviewView, {
    global: {
      provide: { moduleNav: { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({}) } },
      stubs: { Teleport: true, Transition: true }
    }
  })
  await flushPromises()
  return wrapper
}

const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text))
const OPEN_BUTTONS = 'button[aria-label^="Open details for"]'
const keysIn = el => el.findAll(OPEN_BUTTONS).map(b => b.text())
const listKeys = wrapper => keysIn(wrapper.find('tbody'))

describe('Done and Closed-without-delivery (terminal outcome policy)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    sessionStorage.clear()
  })

  it('puts only confirmed completions in Done and never adds a fifth column', async () => {
    const wrapper = await mountOverview(FEATURES)
    expect(wrapper.findAll('h3').map(h => h.text())).toEqual(['Not Started', 'In Progress', 'Done', 'Inactive'])
    expect(keysIn(wrapper.find('#execution-section-complete')).sort()).toEqual(['F-DONE', 'F-DONE-1'])
  })

  it('keeps non-delivery and unknown outcomes in separate collapsed sections with actual resolutions', async () => {
    const wrapper = await mountOverview(FEATURES)
    expect(wrapper.find('#closed-without-delivery-panel').exists()).toBe(false)
    expect(button(wrapper, 'Closed without delivery:').text()).toContain('2')
    expect(button(wrapper, 'Closed, outcome unknown:').text()).toContain('2')

    await button(wrapper, 'Closed without delivery:').trigger('click')
    const panel = wrapper.find('#closed-without-delivery-panel')
    expect(keysIn(panel).sort()).toEqual(['F-DUP', 'F-WONT'])
    expect(panel.text()).toContain("Jira resolution: Won't Do")
    expect(panel.text()).toContain('Jira resolution: Duplicate')

    await button(wrapper, 'Closed, outcome unknown:').trigger('click')
    const unknown = wrapper.find('#closed-outcome-unknown-panel')
    expect(keysIn(unknown).sort()).toEqual(['F-NORES', 'F-UNKNOWN'])
    expect(unknown.text()).toContain('Jira resolution: None')
    expect(wrapper.find('#coverage-panel').exists()).toBe(false)
  })

  it('treats a missing classification (older publication) as unknown, never Done', async () => {
    const older = FEATURES.map(({ terminalOutcome: _terminalOutcome, ...rest }) => rest)
    const wrapper = await mountOverview(older)
    expect(wrapper.find('#execution-section-complete').text()).toContain('No features')
    expect(button(wrapper, 'Closed, outcome unknown:').text()).toContain('6')
  })

  it('keeps Board totals, sections and List consistent', async () => {
    const wrapper = await mountOverview(FEATURES)
    expect(wrapper.text()).toContain('Features: 8')
    const columnTotal = ['not-started', 'in-progress', 'complete', 'inactive']
      .reduce((n, id) => n + keysIn(wrapper.find(`#execution-section-${id}`)).length, 0)
    expect(columnTotal + 2 + 2).toBe(FEATURES.length)

    await button(wrapper, 'List').trigger('click')
    expect(listKeys(wrapper).sort()).toEqual(FEATURES.map(f => f.key).sort())
    const wont = wrapper.findAll('tbody tr').find(r => r.text().includes('F-WONT'))
    expect(wont.text()).toContain("Won't Do")
    expect(wont.text()).toContain('Closed without delivery')
  })

  it('partitions the header counts: known, unknown work status and both closed sections add up to Features', async () => {
    const withUnknownState = [...FEATURES, feature('F-WEIRD', 'Odd', 'Odd', 'mystery', { outcome: null })]
    const wrapper = await mountOverview(withUnknownState)
    const count = label => Number(new RegExp(`${label}:\\s*(\\d+)`).exec(wrapper.text())[1])

    const parts = [
      count('With known work status'), count('Unknown work status'),
      count('Closed without delivery'), count('Closed, outcome unknown')
    ]
    expect(parts).toEqual([4, 1, 2, 2])
    expect(count('Features')).toBe(parts.reduce((a, b) => a + b, 0))
  })

  it('counts no Feature as known work status when only closed lanes are filtered in', async () => {
    const wrapper = await mountOverview(FEATURES, POLICY, { selectedExecutionStates: ['closed-without-delivery'] })
    expect(wrapper.text()).toMatch(/With known work status:\s*0(?!\d)/)
    expect(wrapper.text()).toMatch(/Closed without delivery:\s*2(?!\d)/)
    expect(wrapper.text()).toMatch(/Features:\s*2(?!\d)/)
  })

  it('filters non-delivery and unknown outcomes in List view', async () => {
    const wrapper = await mountOverview(FEATURES, POLICY, { viewMode: 'list', selectedExecutionStates: ['closed-without-delivery'] })
    expect(listKeys(wrapper).sort()).toEqual(['F-DUP', 'F-WONT'])
    sessionStorage.clear()

    const unknown = await mountOverview(FEATURES, POLICY, { viewMode: 'list', selectedExecutionStates: ['closed-outcome-unknown'] })
    expect(listKeys(unknown).sort()).toEqual(['F-NORES', 'F-UNKNOWN'])
  })

  it('constrains Closed Features to the selected Release without selecting one automatically', async () => {
    const all = await mountOverview(FEATURES)
    expect(all.text()).toContain('Features: 8')
    sessionStorage.clear()

    const scoped = await mountOverview(FEATURES, POLICY, { selectedVersions: ['1.0.0'] })
    expect(scoped.text()).toContain('Features: 3')
    expect(button(scoped, 'Closed without delivery:').text()).toContain('1')
    expect(keysIn(scoped.find('#execution-section-complete'))).toEqual(['F-DONE-1'])
  })

  describe('saved lane selections', () => {
    const FC_KEY = 'releases:feature-list-filters:flightctl'
    const OSAC_KEY = 'releases:feature-list-filters'
    const savedLanes = key => JSON.parse(sessionStorage.getItem(key)).selectedExecutionStates

    it('drops a closed-lane selection the loaded project does not offer, keeping valid ones', async () => {
      const wrapper = await mountOverview(FEATURES, {}, {
        selectedExecutionStates: ['closed-without-delivery', 'in-progress']
      })
      expect(savedLanes(FC_KEY)).toEqual(['in-progress'])
      expect(wrapper.text()).toMatch(/Features:\s*1(?!\d)/)
    })

    it('drops an unsupported selection when the inventory is empty and no policy is published', async () => {
      const wrapper = await mountOverview([], {}, { selectedExecutionStates: ['closed-outcome-unknown', 'not-started'] })
      expect(savedLanes(FC_KEY)).toEqual(['not-started'])
      expect(wrapper.text()).not.toContain('1 states')
    })

    it('keeps a closed-lane selection when the inventory is empty and a policy is published', async () => {
      await mountOverview([], POLICY, { selectedExecutionStates: ['closed-outcome-unknown', 'not-started'] })
      expect(savedLanes(FC_KEY)).toEqual(['closed-outcome-unknown', 'not-started'])
    })

    it('keeps a valid selection while the Feature list is still loading', async () => {
      let resolveFeatures
      mockApiRequest.mockImplementation(url => {
        if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', versions: [] })
        return new Promise(resolve => { resolveFeatures = resolve })
      })
      window.location.hash = '#/releases/execute?projectId=flightctl'
      window.dispatchEvent(new Event('urlchange'))
      sessionStorage.setItem(FC_KEY, JSON.stringify({ viewMode: 'list', selectedExecutionStates: ['closed-without-delivery'] }))
      const wrapper = mount(OverviewView, {
        global: {
          provide: { moduleNav: { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({}) } },
          stubs: { Teleport: true, Transition: true }
        }
      })
      await flushPromises()
      expect(savedLanes(FC_KEY)).toEqual(['closed-without-delivery'])

      resolveFeatures({ projectId: 'flightctl', state: 'supported', partial: false, features: FEATURES, featureCount: FEATURES.length, ...POLICY })
      await flushPromises()
      expect(savedLanes(FC_KEY)).toEqual(['closed-without-delivery'])
      expect(listKeys(wrapper).sort()).toEqual(['F-DUP', 'F-WONT'])
    })

    it('does not carry a closed-lane selection into a project that lacks the policy', async () => {
      const wrapper = await mountOverview(FEATURES)
      mockApiRequest.mockImplementation(url => {
        if (url.includes('/versions')) return Promise.resolve({ projectId: 'osac', versions: [] })
        return Promise.resolve({
          projectId: 'osac', state: 'supported', partial: false, features: FEATURES, featureCount: FEATURES.length
        })
      })
      sessionStorage.setItem(OSAC_KEY, JSON.stringify({ selectedExecutionStates: ['closed-without-delivery'] }))
      window.location.hash = '#/releases/execute?projectId=osac'
      window.dispatchEvent(new Event('urlchange'))
      await flushPromises()

      expect(savedLanes(OSAC_KEY)).toEqual([])
      expect(wrapper.text()).not.toMatch(/Features:\s*0(?!\d)/)
    })
  })

  describe('published policy without Feature workStatus', () => {
    // Child rollup and pipeline both report completion; neither may stand in for a Jira status.
    const completedProgress = {
      source: 'jira-child-status-rollup', state: 'supported', coverage: 'complete', issueCount: 2,
      statusCounts: { done: 2, inProgress: 0, toDo: 0, unknown: 0 }
    }
    const noWorkStatus = (key, status = 'Closed', category = 'Done') => {
      const { workStatus: _workStatus, ...rest } = feature(key, status, category, 'done')
      return { ...rest, jiraChildProgress: completedProgress, executionState: 'complete' }
    }
    const count = (wrapper, label) => Number(new RegExp(`${label}:\\s*(\\d+)`).exec(wrapper.text())[1])

    it('shows Status Unknown, never child-derived Done, when no Feature has workStatus', async () => {
      const wrapper = await mountOverview([noWorkStatus('F-A'), noWorkStatus('F-B')])
      expect(wrapper.find('#execution-section-complete').text()).toContain('No features')
      expect(wrapper.findAll('h3').map(h => h.text())).toEqual(['Not Started', 'In Progress', 'Done', 'Inactive'])
      expect(count(wrapper, 'Unknown work status')).toBe(2)
      expect(count(wrapper, 'With known work status')).toBe(0)
      expect(wrapper.text()).toContain('All Work Statuses')
      expect(wrapper.text()).not.toContain('Jira Children: Done')
    })

    it('lists and filters those Features as Status Unknown', async () => {
      const wrapper = await mountOverview([noWorkStatus('F-A'), noWorkStatus('F-B')], POLICY, {
        viewMode: 'list', selectedExecutionStates: ['unavailable']
      })
      expect(listKeys(wrapper).sort()).toEqual(['F-A', 'F-B'])
      expect(wrapper.find('tbody').text()).toContain('Status Unknown')
    })

    it('classifies a mixed inventory per Feature', async () => {
      const mixed = [
        closed('F-DONE', 'Done', 'completed'),
        closed('F-NO-OUTCOME', 'Done', undefined),
        noWorkStatus('F-NO-STATUS')
      ]
      const wrapper = await mountOverview(mixed)
      expect(keysIn(wrapper.find('#execution-section-complete'))).toEqual(['F-DONE'])
      expect(count(wrapper, 'Closed, outcome unknown')).toBe(1)
      expect(count(wrapper, 'Unknown work status')).toBe(1)
      expect(count(wrapper, 'Features')).toBe(3)
    })

    it('activates work-status semantics for an empty inventory', async () => {
      const wrapper = await mountOverview([])
      expect(wrapper.text()).toContain('All Work Statuses')
      expect(wrapper.text()).toMatch(/Features:\s*0(?!\d)/)
    })

    it('keeps child and pipeline derived lanes when no policy is published', async () => {
      const legacy = ['F-A', 'F-B'].map(key => {
        const { workStatus: _workStatus, terminalOutcome: _terminalOutcome, ...rest } = noWorkStatus(key, 'In Progress', 'In Progress')
        return rest
      })
      const wrapper = await mountOverview(legacy, {})
      expect(keysIn(wrapper.find('#execution-section-complete')).sort()).toEqual(['F-A', 'F-B'])
      expect(wrapper.text()).not.toContain('All Work Statuses')
      expect(wrapper.text()).not.toContain('Status Unknown')
    })
  })

  it('keeps release-scoped visibility and Done placement when no outcome policy is published', async () => {
    const osac = [
      feature('F-OPEN', 'In Progress', 'In Progress', 'in-progress', { resolution: null }),
      feature('F-CLOSED', 'Closed', 'Done', 'done', { resolution: "Won't Do", versions: ['1.0.0'] })
    ]
    const hidden = await mountOverview(osac, {})
    expect(hidden.text()).toContain('Features: 1')
    sessionStorage.clear()

    const revealed = await mountOverview(osac, {}, { selectedVersions: ['1.0.0'] })
    expect(keysIn(revealed.find('#execution-section-complete'))).toEqual(['F-CLOSED'])
    expect(revealed.text()).not.toContain('Closed without delivery')
    await button(revealed, 'List').trigger('click')
    expect(revealed.text()).toContain("Won't Do")
  })
})
