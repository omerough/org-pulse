import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import TeamDeliveryTab from '../../client/components/TeamDeliveryTab.vue'

// --- Mocks ---

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    getTeamsForPerson: () => ['Model Serving']
  })
}))

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({ linkTo: () => '#' })
}))

const mockProjectIdRef = ref('flightctl')
vi.mock('@shared/client/composables/useProjectId', () => ({
  useProjectId: () => mockProjectIdRef,
  projectParam: (projectId) => (projectId ? { projectId } : {})
}))

const mockProjectContributions = {}
const mockLoadProjectContributions = vi.fn()
vi.mock('@shared/client/composables/useProjectContributions', () => ({
  useProjectContributions: () => ({
    getByAccountId: (accountId) => mockProjectContributions[accountId] || null,
    loadContributions: mockLoadProjectContributions
  })
}))

// --- Test data ---

const team = {
  key: 'flightctl::team-1',
  displayName: 'Model Serving',
  members: [
    { accountId: 'acc-1', name: 'Alice Smith', customFields: {} },
    { accountId: 'acc-2', name: 'Bob Jones', customFields: {} },
    { accountId: 'acc-3', name: 'Charlie Lee', customFields: {} },
  ]
}

const teamMetrics = {
  aggregate: {
    resolvedCount: 150,
    resolvedPoints: 320,
    inProgressCount: 12,
    avgCycleTimeDays: 4.2
  },
  members: [
    { accountId: 'acc-1', metrics: { resolvedCount: 80, resolvedPoints: 160, avgCycleTimeDays: 3.1, inProgressCount: 5 } },
    { accountId: 'acc-2', metrics: { resolvedCount: 70, resolvedPoints: 160, avgCycleTimeDays: 5.3, inProgressCount: 7 } },
  ],
  resolvedIssues: [{ key: 'PROJ-1', summary: 'Fix bug' }]
}

function mountTab(overrides = {}) {
  return mount(TeamDeliveryTab, {
    props: {
      team,
      teamMetrics,
      teamDisplayName: 'Model Serving',
      ...overrides
    }
  })
}

describe('TeamDeliveryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockProjectContributions).forEach(k => delete mockProjectContributions[k])
    mockProjectIdRef.value = 'flightctl'
  })

  // --- 1. Metric cards ---
  describe('metric cards', () => {
    it('renders all 6 metric cards with correct values', () => {
      const wrapper = mountTab()
      expect(wrapper.text()).toContain('Issues Resolved')
      expect(wrapper.text()).toContain('150')
      expect(wrapper.text()).toContain('Story Points')
      expect(wrapper.text()).toContain('320')
      expect(wrapper.text()).toContain('In Progress')
      expect(wrapper.text()).toContain('12')
      expect(wrapper.text()).toContain('Avg Cycle Time')
      expect(wrapper.text()).toContain('4.2')
      expect(wrapper.text()).toContain('GitHub Contributions')
      expect(wrapper.text()).toContain('GitLab Contributions')
    })

    it('shows -- for null metrics', () => {
      const wrapper = mountTab({ teamMetrics: null })
      const text = wrapper.text()
      // All metric values should show placeholder
      expect(text).toContain('--')
    })
  })

  // --- 2. CSV export ---
  describe('CSV export', () => {
    it('disables export button when teamMetrics is null', () => {
      const wrapper = mountTab({ teamMetrics: null })
      const exportBtn = wrapper.findAll('button').find(b => b.text().includes('Export CSV'))
      expect(exportBtn.attributes('disabled')).toBeDefined()
    })
  })

  // --- 5. Always shows PersonTable ---
  describe('person table', () => {
    it('shows PersonTable', () => {
      const wrapper = mountTab()
      expect(wrapper.findComponent({ name: 'PersonTable' }).exists()).toBe(true)
    })
  })

  describe('member deduplication', () => {
    it('deduplicates members by accountId', () => {
      const dupeTeam = { ...team, members: [...team.members, { ...team.members[0] }] }
      const wrapper = mountTab({ team: dupeTeam })
      expect(wrapper.findComponent({ name: 'PersonTable' }).props('members')).toHaveLength(3)
    })
  })
})

describe('TeamDeliveryTab — canonical (project-qualified) mode', () => {
  const canonicalTeam = {
    key: 'flightctl::team-1',
    displayName: 'Core',
    members: [
      { accountId: 'acc-1', name: 'Nadia Osei', jiraDisplayName: 'Nadia Osei', customFields: {} },
      { accountId: 'acc-2', name: 'Marco Liu', jiraDisplayName: 'Marco Liu', customFields: {} },
      // acc-3 has no published Jira-metrics record at all: unavailable, not a fabricated zero.
      { accountId: 'acc-3', name: 'Priya Shah', jiraDisplayName: 'Priya Shah', customFields: {} }
    ]
  }

  const canonicalTeamMetrics = {
    aggregate: { resolvedCount: 3, resolvedPoints: 10, inProgressCount: 1, avgCycleTimeDays: 3 },
    members: [
      { accountId: 'acc-1', metrics: { resolvedCount: 2, resolvedPoints: 8, avgCycleTimeDays: 2, inProgressCount: 1 } },
      { accountId: 'acc-2', metrics: { resolvedCount: 1, resolvedPoints: 2, avgCycleTimeDays: 5, inProgressCount: 0 } }
    ],
    resolvedIssues: [
      { key: 'FLPATH-101', summary: 'Fix agent reconnect loop', issueType: 'Bug', status: 'Closed', storyPoints: 5, resolutionDate: '2026-09-15T00:00:00Z', accountId: 'acc-1' }
    ],
    inProgressIssues: [
      { key: 'FLPATH-110', summary: 'Add device health probe', issueType: 'Story', status: 'In Progress', storyPoints: 2, resolutionDate: null, accountId: 'acc-1' }
    ],
    partial: true
  }

  function mountCanonicalTab(overrides = {}) {
    return mount(TeamDeliveryTab, {
      props: {
        team: canonicalTeam,
        teamMetrics: canonicalTeamMetrics,
        teamDisplayName: 'Core',
        ...overrides
      }
    })
  }

  // --- Member identity ---
  it('joins per-member Jira metrics by accountId, not display name', () => {
    const wrapper = mountCanonicalTab()
    const memberMetrics = wrapper.findComponent({ name: 'PersonTable' }).props('memberMetrics')
    expect(memberMetrics.get('acc-1')).toEqual(canonicalTeamMetrics.members[0].metrics)
    expect(memberMetrics.get('acc-2')).toEqual(canonicalTeamMetrics.members[1].metrics)
  })

  // --- Duplicate membership (shared display name) ---
  it('does not collapse two members that share a display name but have different accountIds', () => {
    const dupeNameTeam = {
      ...canonicalTeam,
      members: [
        { accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} },
        { accountId: 'acc-2', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }
      ]
    }
    const wrapper = mountCanonicalTab({ team: dupeNameTeam })
    expect(wrapper.findComponent({ name: 'PersonTable' }).props('members')).toHaveLength(2)
  })

  // --- Unavailable / partial data ---
  it('treats a roster member missing from the publication as unavailable, not a fabricated zero', () => {
    const wrapper = mountCanonicalTab()
    expect(wrapper.findComponent({ name: 'PersonTable' }).props('memberMetrics').has('acc-3')).toBe(false)
  })

  // --- Published lookback window ---
  describe('Issues Resolved / Story Points window subtitle', () => {
    const fullTeam = {
      ...canonicalTeam,
      members: canonicalTeam.members.slice(0, 2)
    }
    const metricsWithWindows = (windows, extra = {}) => ({
      ...canonicalTeamMetrics,
      memberCount: 2,
      members: windows.map((lookbackDays, i) => ({
        accountId: `acc-${i + 1}`,
        metrics: { lookbackDays, resolvedCount: 1, resolvedPoints: 1, avgCycleTimeDays: 1, inProgressCount: 0 }
      })),
      ...extra
    })
    const windowSubtitles = (wrapper) => ['Issues Resolved', 'Story Points'].map(label =>
      wrapper.findAllComponents({ name: 'MetricCard' }).find(c => c.props('label') === label).props('subtitle')
    )

    it('labels a consistent 365-day window as "Last year"', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: metricsWithWindows([365, 365]) })
      expect(windowSubtitles(wrapper)).toEqual(['Last year', 'Last year'])
    })

    it('labels a consistent non-365 window with the published day count', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: metricsWithWindows([90, 90]) })
      expect(windowSubtitles(wrapper)).toEqual(['Last 90 days', 'Last 90 days'])
    })

    it('omits the subtitle when members report mixed windows', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: metricsWithWindows([90, 365]) })
      expect(windowSubtitles(wrapper)).toEqual(['', ''])
    })

    it('omits the subtitle when any member window is unknown', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: metricsWithWindows([90, null]) })
      expect(windowSubtitles(wrapper)).toEqual(['', ''])
    })

    it('omits the subtitle when a roster member has no published record', () => {
      const wrapper = mountCanonicalTab({ teamMetrics: metricsWithWindows([365, 365]) })
      expect(windowSubtitles(wrapper)).toEqual(['', ''])
    })

    it('omits the subtitle when the publication counts more members than it carries records for', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: metricsWithWindows([365, 365], { memberCount: 3 }) })
      expect(windowSubtitles(wrapper)).toEqual(['', ''])
    })

    it('omits the subtitle when team metrics are unavailable', () => {
      const wrapper = mountCanonicalTab({ team: fullTeam, teamMetrics: null })
      expect(windowSubtitles(wrapper)).toEqual(['', ''])
    })
  })

  it('reports GitHub contributions as unavailable (--), not zero, when no member resolved an identity', () => {
    const wrapper = mountCanonicalTab()
    const ghCard = wrapper.findAllComponents({ name: 'MetricCard' }).find(c => c.props('label') === 'GitHub Contributions')
    expect(ghCard.text()).toContain('--')
  })

  // --- GitHub aggregation ---
  it('aggregates GitHub contributions by accountId, excluding members with no resolved identity', () => {
    mockProjectContributions['acc-1'] = { accountId: 'acc-1', github: { totalContributions: 100 } }
    mockProjectContributions['acc-2'] = { accountId: 'acc-2', github: { totalContributions: 50 } }
    // acc-3 has no entry at all.
    const wrapper = mountCanonicalTab()
    expect(wrapper.text()).toMatch(/GitHub Contributions\s*150/)
    expect(wrapper.text()).toContain('2/3 with data')
  })

  // --- Unsupported GitLab ---
  it('shows GitLab as Unsupported instead of a count or a fabricated zero', () => {
    const wrapper = mountCanonicalTab()
    const glCard = wrapper.findAllComponents({ name: 'MetricCard' }).find(c => c.props('label') === 'GitLab Contributions')
    expect(glCard.text()).toContain('Unsupported')
    expect(wrapper.findComponent({ name: 'PersonTable' }).text()).toContain('Unsupported')
    expect(wrapper.text()).not.toContain('View History')
  })

  // --- Issue details ---
  it('resolves issue-detail assignee names from accountId via the roster join', async () => {
    const wrapper = mountCanonicalTab()
    const resolvedCard = wrapper.findAllComponents({ name: 'MetricCard' }).find(c => c.props('label') === 'Issues Resolved')
    await resolvedCard.vm.$emit('click')

    const modal = wrapper.findComponent({ name: 'ResolvedIssuesModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('issues')[0].assignee).toBe('Nadia Osei')
  })

  // --- CSV ---
  it('exports CSV with accountId-joined metrics and Unsupported GitLab', () => {
    mockProjectContributions['acc-1'] = { accountId: 'acc-1', github: { totalContributions: 100 } }

    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()

    let downloadedContent = null
    const OrigBlob = global.Blob
    global.Blob = class extends OrigBlob {
      constructor(parts, options) {
        super(parts, options)
        downloadedContent = parts[0]
      }
    }

    const mockClick = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const el = origCreateElement(tag)
        el.click = mockClick
        return el
      }
      return origCreateElement(tag)
    })

    const wrapper = mountCanonicalTab()
    const exportBtn = wrapper.findAll('button').find(b => b.text().includes('Export CSV'))
    exportBtn.trigger('click')

    expect(mockClick).toHaveBeenCalled()
    const lines = downloadedContent.split('\n')
    expect(lines[1]).toContain('"Nadia Osei"')
    expect(lines[1]).toContain('"100"')
    expect(lines[1]).toContain('"Unsupported"')

    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
    global.Blob = OrigBlob
    document.createElement.mockRestore?.()
  })

  // --- Project switching ---
  it('reloads project contributions when the active project changes', async () => {
    mountCanonicalTab()
    const callsBefore = mockLoadProjectContributions.mock.calls.length
    expect(callsBefore).toBeGreaterThan(0)

    mockProjectIdRef.value = 'other-project'
    await flushPromises()

    expect(mockLoadProjectContributions.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})
