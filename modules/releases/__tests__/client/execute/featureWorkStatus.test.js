import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'
import FeatureDetailView from '../../../client/views/FeatureDetailView.vue'

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

const mockDetail = ref(null)
vi.mock('../../../client/execute/composables/useFeatureTraffic', async importOriginal => ({
  ...(await importOriginal()),
  useFeatureDetail: () => ({
    feature: mockDetail, loading: ref(false), error: ref(null), loadFeature: vi.fn()
  })
}))
vi.mock('../../../client/execute/composables/useAIReview.js', () => ({
  useAIReview: () => ({
    aiReview: ref(null), aiReviewLoading: ref(false), aiReviewError: ref(null), loadAIReview: vi.fn()
  })
}))

function childProgress(done, inProgress, toDo) {
  const total = done + inProgress + toDo
  return total === 0
    ? {
        source: 'jira-child-status-rollup', state: 'empty', coverage: 'complete', issueCount: 0,
        knownStatusIssueCount: 0, statusCounts: { done: 0, inProgress: 0, toDo: 0, unknown: 0 },
        reason: 'no-matching-jira-children'
      }
    : {
        source: 'jira-child-status-rollup', state: 'supported', coverage: 'complete', issueCount: total,
        knownStatusIssueCount: total, statusCounts: { done, inProgress, toDo, unknown: 0 }, reason: null
      }
}

function feature(key, status, statusCategory, state, progress, extra = {}) {
  return {
    key, summary: `Summary ${key}`, status, statusCategory, fixVersions: ['1.0.0'], components: [], labels: [],
    epicCount: progress.issueCount ? 1 : 0, issueCount: null, blockerCount: null,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
    executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
    preparationReadiness: 'unknown', jiraChildProgress: progress,
    workStatus: { source: 'jira-feature-status', state },
    coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' },
    ...extra
  }
}

const FEATURES = [
  feature('EDM-BACKLOG-EPICS', 'Backlog', 'To Do', 'inactive', childProgress(0, 2, 1)),
  feature('EDM-BACKLOG-EMPTY', 'Backlog', 'To Do', 'inactive', childProgress(0, 0, 0)),
  feature('EDM-NEW', 'New', 'To Do', 'not-started', childProgress(0, 0, 0)),
  feature('EDM-TODO', 'To Do', 'To Do', 'not-started', childProgress(0, 0, 3)),
  feature('EDM-ACTIVE', 'In Progress', 'In Progress', 'in-progress', childProgress(0, 0, 2)),
  feature('EDM-FINISHED', 'Release Pending', 'Done', 'done', childProgress(2, 0, 0)),
  feature('EDM-UNKNOWN', 'Triage', null, 'unknown', childProgress(0, 1, 0))
]

async function mountOverview(features = FEATURES) {
  window.location.hash = '#/releases/execute?projectId=flightctl'
  window.dispatchEvent(new Event('urlchange'))
  mockApiRequest.mockImplementation(url => {
    if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', versions: ['1.0.0'] })
    return Promise.resolve({
      projectId: 'flightctl', state: 'supported', partial: false, features, featureCount: features.length
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

function rowFor(wrapper, key) {
  return wrapper.findAll('tbody tr').find(row => row.text().includes(key))
}

describe('Feature List work status (Jira-backed project)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    sessionStorage.clear()
  })

  it('shows an Inactive column and keeps child progress out of the lane', async () => {
    const wrapper = await mountOverview()
    expect(wrapper.findAll('h3').map(h => h.text())).toEqual(['Not Started', 'In Progress', 'Done', 'Inactive'])
    expect(wrapper.text()).toContain('Work status comes from each Feature’s own Jira status')
    expect(wrapper.text()).toContain('With known work status:')
    expect(wrapper.text()).toContain('Unknown work status:')
  })

  it('places each Feature by its own Jira status in list view and keeps real status names', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    const lanes = {
      'EDM-BACKLOG-EPICS': 'Inactive',
      'EDM-BACKLOG-EMPTY': 'Inactive',
      'EDM-NEW': 'Not Started',
      'EDM-TODO': 'Not Started',
      'EDM-ACTIVE': 'In Progress',
      'EDM-FINISHED': 'Done',
      'EDM-UNKNOWN': 'Status Unknown'
    }
    for (const [key, lane] of Object.entries(lanes)) {
      expect(rowFor(wrapper, key).text(), key).toContain(lane)
    }
    expect(rowFor(wrapper, 'EDM-BACKLOG-EPICS').text()).toContain('Backlog')
    expect(rowFor(wrapper, 'EDM-NEW').text()).toContain('New')
    expect(rowFor(wrapper, 'EDM-TODO').text()).toContain('To Do')
  })

  it('does not promote a Backlog Feature to In Progress because its children are active', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    const row = rowFor(wrapper, 'EDM-BACKLOG-EPICS').text()
    expect(row).not.toContain('In Progress')
    expect(row).toContain('0/3 Jira Done')
  })

  it('does not demote an In Progress Feature whose children are all To Do', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    const row = rowFor(wrapper, 'EDM-ACTIVE').text()
    expect(row).toContain('In Progress')
    expect(row).toContain('0/2 Jira Done')
  })

  it('treats a Feature without Epics or Stories as neutral, not as failed readiness', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    const row = rowFor(wrapper, 'EDM-BACKLOG-EMPTY').text()
    expect(row).toContain('No eligible Jira child issues')
    expect(row).toContain('Unknown')
    expect(row).not.toMatch(/Pending|RED|Blocked/)
  })

  it('filters by work status', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    await wrapper.findAll('button').find(b => b.text().includes('All Work Statuses')).trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Inactive')
    await option.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('EDM-BACKLOG-EPICS')
    expect(wrapper.text()).toContain('EDM-BACKLOG-EMPTY')
    expect(wrapper.text()).not.toContain('EDM-ACTIVE')
  })

  it('keeps Features with an unrecognized status category visible in the coverage panel', async () => {
    const wrapper = await mountOverview()
    await wrapper.findAll('button').find(b => b.text().includes('Unknown work status')).trigger('click')
    expect(wrapper.text()).toContain('EDM-UNKNOWN')
  })

  it('keeps a Feature without its own work status off the board unless its progress is measurable', async () => {
    const mixed = [
      ...FEATURES,
      feature('EDM-NOWS', 'In Progress', 'In Progress', 'in-progress', childProgress(0, 0, 0), {
        workStatus: undefined, jiraChildProgress: undefined, executionState: 'in-progress'
      })
    ]
    const wrapper = await mountOverview(mixed)
    expect(wrapper.find('#execution-section-in-progress').text()).not.toContain('EDM-NOWS')
    expect(wrapper.find('#execution-section-in-progress').text()).toContain('EDM-ACTIVE')
    await wrapper.findAll('button').find(b => b.text().includes('Unknown work status')).trigger('click')
    expect(wrapper.find('#coverage-panel').text()).toContain('EDM-NOWS')
  })

  it('drops a stored execution-state selection that the loaded option set does not offer', async () => {
    sessionStorage.setItem('releases:feature-list-filters:flightctl', JSON.stringify({
      selectedExecutionStates: ['no-tracked-work', 'inactive']
    }))
    const wrapper = await mountOverview()
    const trigger = wrapper.findAll('button').find(b => b.attributes('title')?.includes('Features whose own Jira status'))
    expect(trigger.text()).toBe('Inactive')
  })

  it('labels coverage progress by its source', async () => {
    const unknownWorkStatus = { state: 'unknown', source: 'jira-feature-status' }
    const features = [
      feature('EDM-ACTIVE', 'In Progress', 'In Progress', 'in-progress', childProgress(0, 0, 2)),
      feature('EDM-CHILDREN', 'Triage', null, 'unknown', childProgress(1, 1, 2)),
      feature('EDM-PIPELINE', 'Triage', null, 'unknown', childProgress(0, 0, 0), {
        workStatus: unknownWorkStatus, jiraChildProgress: undefined, executionState: 'in-progress',
        executionCoverage: 'available', executionIssueCount: 4, doneExecutionIssueCount: 3
      })
    ]
    const wrapper = await mountOverview(features)
    await wrapper.findAll('button').find(b => b.text().includes('Unknown work status')).trigger('click')
    const panel = wrapper.find('#coverage-panel').text()
    expect(panel).toContain('1/4 Jira child issues Done')
    expect(panel).toContain('3/4 issues Done')
    expect(panel).not.toContain('undefined')
  })

  it('keeps the legacy Jira child-status lanes when no work status is published', async () => {
    const legacy = FEATURES.slice(2, 3).map(f => ({ ...f, workStatus: undefined }))
    const wrapper = await mountOverview(legacy)
    expect(wrapper.text()).toContain('Jira Children')
    expect(wrapper.text()).not.toContain('Work status comes from')
    expect(wrapper.findAll('h3').map(h => h.text())).toEqual([
      'Jira Children: To Do', 'Mixed Jira Child Statuses', 'Jira Children: Done'
    ])
  })
})

describe('Feature Detail header work status', () => {
  const nav = { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({ key: 'EDM-1' }) }

  async function mountDetail(detail, stubs = { EpicBreakdown: true }) {
    mockApiRequest.mockResolvedValue({ features: [] })
    mockDetail.value = detail
    const wrapper = mount(FeatureDetailView, {
      global: {
        provide: { moduleNav: nav },
        stubs: {
          TrafficMap: true, SignoffSection: true, AIReviewSection: true,
          HygieneViolations: true, Teleport: true, ...stubs
        }
      }
    })
    await flushPromises()
    return wrapper
  }

  it('marks a Backlog Feature Inactive without inventing a missing Status color', async () => {
    const wrapper = await mountDetail({
      key: 'EDM-1', summary: 'Backlog feature', status: 'Backlog', statusCategory: 'To Do',
      fixVersions: ['1.0.0'], epics: [], workStatus: { source: 'jira-feature-status', state: 'inactive' }
    })
    expect(wrapper.text()).toContain('Backlog')
    expect(wrapper.text()).toContain('Inactive')
    expect(wrapper.text()).not.toContain('Status color missing')
  })

  it('does not label New or To Do Features Inactive', async () => {
    const wrapper = await mountDetail({
      key: 'EDM-1', summary: 'New feature', status: 'New', statusCategory: 'To Do', fixVersions: [], epics: [],
      workStatus: { source: 'jira-feature-status', state: 'not-started' }
    })
    expect(wrapper.text()).toContain('New')
    expect(wrapper.text()).not.toContain('Inactive')
  })

  it('shows each Epic’s release with its provenance on the Epics tab', async () => {
    const epic = (key, fixVersions, fixVersionSource) => ({
      key, summary: key, status: 'New', statusCategory: 'To Do', priority: 'Normal', components: [], labels: [],
      issues: [], fixVersions, fixVersionSource
    })
    const wrapper = await mountDetail({
      key: 'EDM-1', summary: 'Feature', status: 'In Progress', statusCategory: 'In Progress',
      fixVersions: ['0.9', '1.0'],
      epics: [
        epic('EDM-E1', ['0.9'], 'direct'),
        epic('EDM-E2', ['0.9', '1.0'], 'via-parent-feature'),
        epic('EDM-E3', [], 'unknown')
      ],
      workStatus: { source: 'jira-feature-status', state: 'in-progress' }
    }, {})
    await wrapper.findAll('button').find(b => b.text() === 'Epics').trigger('click')
    const cards = wrapper.findAll('div.rounded-lg').filter(c => /EDM-E\d/.test(c.text()) && !c.text().includes('Epic Breakdown'))
    const byKey = key => cards.find(c => c.text().includes(key)).text()
    expect(byKey('EDM-E1')).not.toContain('inherited from Feature')
    expect(byKey('EDM-E2')).toContain('inherited from Feature')
    expect(byKey('EDM-E2')).toContain('1.0')
    expect(byKey('EDM-E3')).toContain('Unknown')
    expect(wrapper.text()).not.toContain('Parent Feature')
  })

  it('still reports a missing Status color for payloads that carry the field', async () => {
    const wrapper = await mountDetail({
      key: 'OSAC-1', summary: 'OSAC feature', status: 'In Progress', statusCategory: 'In Progress',
      fixVersions: [], epics: [], colorStatus: null
    })
    expect(wrapper.text()).toContain('Status color missing')
  })
})
