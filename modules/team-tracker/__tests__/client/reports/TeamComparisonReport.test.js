import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, nextTick } from 'vue'
import TeamComparisonReport from '../../../client/reports/TeamComparisonReport.vue'
import ReportChart from '../../../client/components/ReportChart.vue'
import { useReportFilters } from '../../../client/composables/useReportFilters'

const mockIsNormalizedModel = ref(false)
const mockRosterTeams = ref([])

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    orgs: ref([
      {
        key: 'org1',
        displayName: 'Org One',
        teams: {
          'Team A': {
            displayName: 'Team A',
            members: [{ name: 'Alice', githubUsername: 'alice-gh' }]
          }
        }
      }
    ]),
    teams: mockRosterTeams,
    isNormalizedModel: mockIsNormalizedModel,
    selectedOrgKey: ref(null),
    selectOrg: vi.fn(),
    loadRoster: vi.fn(),
  })
}))

const mockProjectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId,
}))

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({
    getContributions: vi.fn(() => ({ totalContributions: 100 })),
    loadGithubStats: vi.fn(),
  })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({
    getContributions: vi.fn(() => ({ totalContributions: 50 })),
    loadGitlabStats: vi.fn(),
  })
}))

vi.mock('@shared/client/services/api', () => ({
  getTeamMetrics: vi.fn(async () => ({
    memberCount: 5,
    aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 }
  }))
}))

describe('TeamComparisonReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectId.value = ''
    mockIsNormalizedModel.value = false
    mockRosterTeams.value = []
    useReportFilters().selectedTeamKeys.value = []
    useReportFilters().selectedOrgKeys.value = []
  })

  function createWrapper() {
    return mount(TeamComparisonReport, {
      global: {
        provide: {
          moduleNav: {
            navigateTo: vi.fn(),
            goBack: vi.fn(),
            params: readonly(ref({})),
            moduleSlug: readonly(ref('team-tracker')),
          }
        },
        stubs: {
          ReportChart: {
            template: '<div data-testid="report-chart">{{ title }}</div>',
            props: ['type', 'labels', 'data', 'title', 'unit'],
          }
        }
      }
    })
  }

  it('renders metric checkboxes', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Team Size')
    expect(wrapper.text()).toContain('Issues Resolved')
    expect(wrapper.text()).toContain('GitHub Contributions (1yr)')
  })

  it('renders chart type toggle', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Bar')
    expect(wrapper.text()).toContain('Horizontal')
    expect(wrapper.text()).toContain('Doughnut')
  })

  it('renders Run button', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Run')
  })

  it('shows empty state initially', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Select teams and metrics, then click Run')
  })

  it('Run button is disabled when no teams or metrics selected', () => {
    const wrapper = createWrapper()
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))
    expect(runButton.attributes('disabled')).toBeDefined()
  })

  describe('project mode', () => {
    beforeEach(() => {
      mockProjectId.value = 'flightctl'
      mockIsNormalizedModel.value = true
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Flight Team', members: [{ name: 'Bob', githubUsername: null, gitlabUsername: null }] }
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1']
    })

    it('enables the GitHub checkboxes in project mode (contributions are connected)', () => {
      const wrapper = createWrapper()
      const checkbox = wrapper.find('input[value="githubContributions"]')
      expect(checkbox.exists()).toBe(true)
      expect(checkbox.attributes('disabled')).toBeUndefined()
    })

    it('keeps GitLab checkboxes visible but disabled as Unsupported, with an inline reason', () => {
      const wrapper = createWrapper()
      const checkbox = wrapper.find('input[value="gitlabContributions"]')
      expect(checkbox.exists()).toBe(true)
      expect(checkbox.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('GitLab Contributions (1yr)')
      expect(wrapper.text()).toContain('(Unsupported for this project)')
    })

    it('calls getTeamMetrics with the project id', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
    })

    it('reads GitHub totals from the connected contributions publication, not a username join', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: { total: 88, memberCount: 2, contributorCount: 2 } }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="githubContributions"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      const chart = wrapper.findComponent(ReportChart)
      expect(chart.exists()).toBe(true)
      // The default useGithubStats mock returns totalContributions: 100 per username
      // lookup; asserting 88 proves the chart used aggregate.github, not that path.
      expect(chart.props('data')).toEqual([88])
    })

    it('computes per-member GitHub average using the contributions publication\'s own member count', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 5,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: { total: 90, memberCount: 2, contributorCount: 2 } }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="githubPerMember"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      // 90 / 2 (the contributions publication's own memberCount, not the Jira
      // roster's memberCount of 5) = 45.
      expect(wrapper.findComponent(ReportChart).props('data')).toEqual([45])
    })

    it('shows the team as unavailable, not a fabricated zero, when the contributions publication has nothing for it', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: null }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="githubContributions"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('not published for the selected team(s)')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
    })

    it('labels Issues Resolved with the publication\'s real lookback window instead of a fabricated 90d', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: 365 }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved (365d)')
    })

    it('omits the lookback suffix when it is unknown, rather than asserting a wrong window', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: null }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved')
    })

    it('omits the lookback suffix when one of several active teams has an unknown window, even though the rest agree', async () => {
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Flight Team', members: [{ name: 'Bob', githubUsername: null, gitlabUsername: null }] },
        { key: 'flightctl::team-2', displayName: 'Flight Team 2', members: [{ name: 'Carol', githubUsername: null, gitlabUsername: null }] }
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementation(async teamKey => (
        teamKey === 'flightctl::team-1'
          ? { teamKey, available: true, memberCount: 2, aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: 365 } }
          : { teamKey, available: true, memberCount: 2, aggregate: { resolvedCount: 3, avgCycleTimeDays: 1, lookbackDays: null } }
      ))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved')
    })

    it('shows the unavailable banner instead of a fabricated zero when Jira metrics are unpublished', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')
      expect(wrapper.text()).toContain('Jira metrics have not been published for this project yet.')
    })

    it('retries fetching on a subsequent Run after an unavailable result, instead of treating it as cached', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')

      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 5, aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 }
      }))
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()

      expect(getTeamMetrics).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).not.toContain('Jira metrics are not available for this project')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(true)
    })

    it('clears stale charts and the unavailable banner on project switch', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')

      mockProjectId.value = 'osac'
      await nextTick()
      expect(wrapper.text()).not.toContain('Jira metrics are not available for this project')
    })

    it('ignores a stale run result that resolves after a project switch', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      let resolveStale
      getTeamMetrics.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))

      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()

      mockProjectId.value = 'osac'
      await nextTick()

      resolveStale({ teamKey: 'flightctl::team-1', available: true, memberCount: 5, aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 } })
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('Select teams and metrics, then click Run')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
    })
  })
})
