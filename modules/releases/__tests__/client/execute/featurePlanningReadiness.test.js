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

const designPr = (number, status, extra = {}) => ({
  number, status, url: `https://github.com/flightctl/design-docs/pull/${number}`, draft: false,
  reviewStatus: null, createdAt: '2026-05-01T00:00:00Z', updatedAt: null, mergedAt: null, ...extra
})

function evidence(overrides = {}) {
  return {
    source: 'sources/ep-review/features.json',
    requiredStatusFields: ['designPrStatus'],
    statuses: { designPrStatus: null },
    lookup: 'complete',
    lookupReason: null,
    designPr: null,
    designPrs: [],
    approvalTiming: null,
    ...overrides
  }
}

function detail(key, readiness, readinessEvidence, extra = {}) {
  return {
    key, summary: `Summary ${key}`, status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['1.5.0'],
    epics: [], workStatus: { source: 'jira-feature-status', state: 'in-progress' },
    preparationReadiness: readiness, ...(readinessEvidence ? { readinessEvidence } : {}), ...extra
  }
}

describe('Feature Detail planning readiness', () => {
  const nav = { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({ key: 'EDM-1' }) }

  async function mountDetail(value) {
    mockApiRequest.mockResolvedValue({ features: [] })
    mockDetail.value = value
    const wrapper = mount(FeatureDetailView, {
      global: {
        provide: { moduleNav: nav },
        stubs: {
          TrafficMap: true, SignoffSection: true, AIReviewSection: true, EpicBreakdown: true,
          HygieneViolations: true, Teleport: true
        }
      }
    })
    await flushPromises()
    return wrapper
  }

  it('shows a merged Design PR as Ready with its source link and merge date', async () => {
    const merged = designPr(81, 'Merged', { mergedAt: '2026-05-20T10:00:00Z' })
    const wrapper = await mountDetail(detail('EDM-1', 'ready', evidence({ designPr: merged, designPrs: [merged] })))
    const panel = wrapper.get('[data-testid="planning-readiness"]')
    expect(panel.text()).toContain('Planning readiness')
    expect(panel.text()).toContain('Ready')
    expect(panel.text()).toContain('Required Design pull request has been merged.')
    const link = panel.get('[data-testid="design-pr-primary"] a')
    expect(link.attributes('href')).toBe('https://github.com/flightctl/design-docs/pull/81')
    expect(panel.text()).toContain('merged')
  })

  it('shows an approved but unmerged Design PR as Pending, not Ready', async () => {
    const pr = designPr(80, 'Open', { reviewStatus: 'APPROVED' })
    const wrapper = await mountDetail(detail('EDM-1', 'pending', evidence({ designPr: pr, designPrs: [pr] })))
    const panel = wrapper.get('[data-testid="planning-readiness"]')
    expect(panel.text()).toContain('Pending')
    expect(panel.text()).toContain('Open, approved — not yet merged')
    expect(panel.text()).not.toContain('Ready')
  })

  it('says no verified Design PR was found when a complete lookup returns nothing', async () => {
    const wrapper = await mountDetail(detail('EDM-1', 'unknown', evidence()))
    const panel = wrapper.get('[data-testid="planning-readiness"]')
    expect(panel.text()).toContain('Unknown')
    expect(panel.text()).toContain('No verified Design pull request was found')
    expect(panel.find('[data-testid="design-pr-primary"]').exists()).toBe(false)
  })

  it('does not claim a PR is missing when the evidence source was unavailable', async () => {
    const wrapper = await mountDetail(detail('EDM-1', 'unknown',
      evidence({ lookup: 'unavailable', lookupReason: 'design-docs-unavailable' })))
    const text = wrapper.get('[data-testid="planning-readiness"]').text()
    expect(text).toContain('evidence is currently unavailable')
    expect(text).not.toContain('No verified')
  })

  it('lists superseded or closed Design PRs separately from the governing PR', async () => {
    const merged = designPr(1, 'Merged', { mergedAt: '2026-05-20T10:00:00Z' })
    const closed = designPr(3, 'Closed')
    const wrapper = await mountDetail(detail('EDM-1', 'ready', evidence({ designPr: merged, designPrs: [merged, closed] })))
    const others = wrapper.get('[data-testid="design-pr-others"]')
    expect(others.text()).toContain('#3')
    expect(others.text()).toContain('Closed without merging')
    expect(wrapper.get('[data-testid="design-pr-primary"]').text()).toContain('#1')
  })

  it('shows late approval as informational and omits timing when the release start is unknown', async () => {
    const merged = designPr(1, 'Merged', { mergedAt: '2026-06-02T00:00:00Z' })
    const base = { designPr: merged, designPrs: [merged] }
    let wrapper = await mountDetail(detail('EDM-1', 'ready', evidence({
      ...base, approvalTiming: { state: 'late', mergedAt: merged.mergedAt, releaseStart: '2026-06-01' }
    })))
    expect(wrapper.get('[data-testid="design-approval-timing"]').text()).toContain('Informational only')
    expect(wrapper.get('[data-testid="planning-readiness"]').text()).toContain('Ready')

    wrapper = await mountDetail(detail('EDM-1', 'ready', evidence({
      ...base, approvalTiming: { state: 'unknown', reason: 'release-start-unknown', mergedAt: merged.mergedAt }
    })))
    expect(wrapper.find('[data-testid="design-approval-timing"]').exists()).toBe(false)
  })

  it('keeps an inactive Backlog Feature inactive regardless of Design readiness', async () => {
    const pr = designPr(80, 'Open')
    const wrapper = await mountDetail(detail('EDM-1', 'pending', evidence({ designPr: pr, designPrs: [pr] }), {
      status: 'Backlog', statusCategory: 'To Do', workStatus: { source: 'jira-feature-status', state: 'inactive' }
    }))
    expect(wrapper.text()).toContain('Inactive')
    expect(wrapper.get('[data-testid="planning-readiness"]').text()).toContain('Pending')
  })

  it('renders no planning readiness panel for rows without published evidence (OSAC)', async () => {
    const wrapper = await mountDetail(detail('OSAC-1', 'ready', null, { colorStatus: 'Green' }))
    expect(wrapper.find('[data-testid="planning-readiness"]').exists()).toBe(false)
  })
})

describe('Feature List readiness badge', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    sessionStorage.clear()
  })

  async function mountOverview(features, projectId) {
    window.location.hash = `#/releases/execute?projectId=${projectId}`
    window.dispatchEvent(new Event('urlchange'))
    mockApiRequest.mockImplementation(url => {
      if (url.includes('/versions')) return Promise.resolve({ projectId, versions: ['1.5.0'] })
      return Promise.resolve({ projectId, state: 'supported', partial: false, features, featureCount: features.length })
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

  const row = (key, readiness, readinessEvidence) => ({
    key, summary: `Summary ${key}`, status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['1.5.0'],
    components: [], labels: [], epicCount: 0, issueCount: null, blockerCount: null, executionIssueCount: null,
    doneExecutionIssueCount: null, executionState: 'unavailable', executionCoverage: 'unavailable',
    executionCoverageReason: 'no-compatible-feature-producer', preparationReadiness: readiness,
    workStatus: { source: 'jira-feature-status', state: 'in-progress' },
    coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'pr-status-evidence' },
    ...(readinessEvidence ? { readinessEvidence } : {})
  })

  it('shows the published readiness state for each Feature', async () => {
    const wrapper = await mountOverview([
      row('EDM-READY', 'ready', evidence({ designPr: designPr(1, 'Merged'), designPrs: [] })),
      row('EDM-PENDING', 'pending', evidence({ designPr: designPr(2, 'Open'), designPrs: [] })),
      row('EDM-UNKNOWN', 'unknown', evidence())
    ], 'flightctl')
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    const rowFor = key => wrapper.findAll('tbody tr').find(r => r.text().includes(key)).text()
    expect(rowFor('EDM-READY')).toContain('Ready')
    expect(rowFor('EDM-PENDING')).toContain('Pending')
    expect(rowFor('EDM-UNKNOWN')).toContain('Unknown')
  })
})
