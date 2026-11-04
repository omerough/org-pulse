import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, readonly, nextTick, defineComponent, h, effectScope } from 'vue'
import TrendsReport from '../../../client/reports/TrendsReport.vue'
import TeamComparisonReport from '../../../client/reports/TeamComparisonReport.vue'
import { useReportFilters } from '../../../client/composables/useReportFilters'
import { useRoster } from '@shared/client/composables/useRoster'
import { getRoster, getTrends, getTeamMetrics } from '@shared/client/services/api'

vi.mock('@shared/client/services/api', () => ({
  getRoster: vi.fn(),
  getTrends: vi.fn(),
  getTeamMetrics: vi.fn(),
}))

const PROJECTS = {
  alpha: { teams: [['alpha-1', 'Alpha One'], ['alpha-2', 'Alpha Two']] },
  beta: { teams: [['beta-1', 'Beta One'], ['beta-2', 'Beta Two']] },
}

function rosterFor(projectId) {
  const teams = PROJECTS[projectId].teams.map(([key, displayName]) => ({
    key, id: key, displayName, memberAccountIds: [],
  }))
  return { projectId, teams, people: [] }
}

function trendsFor(projectId) {
  const month = new Date().toISOString().slice(0, 7)
  const byTeam = Object.fromEntries(
    PROJECTS[projectId].teams.map(([key]) => [key, { resolved: 3, avgCycleTimeDays: 2 }])
  )
  return { jira: { [month]: { resolved: 6, avgCycleTimeDays: 2, byTeam } }, github: null, gitlab: null }
}

function metricsFor(key) {
  return { key, memberCount: 1, aggregate: { resolvedCount: 4, avgCycleTimeDays: 2 } }
}

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

function switchProject(projectId) {
  window.location.hash = `#/team-tracker/reports?projectId=${projectId}`
  window.dispatchEvent(new Event('urlchange'))
}

const TrendChartStub = defineComponent({
  name: 'TrendChart',
  props: ['labels', 'datasets', 'title', 'unit'],
  setup(props) {
    return () => h('div', {
      'data-testid': 'trend-chart',
      'data-title': props.title,
      'data-series': JSON.stringify((props.datasets || []).map(d => d.label)),
    })
  },
})
const ReportChartStub = defineComponent({
  name: 'ReportChart',
  props: ['type', 'labels', 'data', 'title', 'unit'],
  setup(props) {
    return () => h('div', { 'data-testid': 'report-chart', 'data-labels': JSON.stringify(props.labels) })
  },
})

const mounted = []

// Reads the shared selection refs without leaving a watcher registered outside a component.
function filterState() {
  const scope = effectScope()
  const state = scope.run(() => useReportFilters())
  scope.stop()
  return state
}

function mountReport(component) {
  const wrapper = mount(component, {
    global: {
      provide: {
        moduleNav: {
          navigateTo: vi.fn(),
          goBack: vi.fn(),
          params: readonly(ref({})),
          moduleSlug: readonly(ref('team-tracker')),
        },
      },
      stubs: { TrendChart: TrendChartStub, ReportChart: ReportChartStub },
    },
  })
  mounted.push(wrapper)
  return wrapper
}

function trendSeries(wrapper) {
  return wrapper.findAll('[data-testid="trend-chart"]').flatMap(c => JSON.parse(c.attributes('data-series')))
}

async function settle() {
  await flushPromises()
  await nextTick()
}

describe('report project isolation', () => {
  // Filter watchers live as long as their component, so leaked mounts would mask isolation bugs.
  afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount())
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    getRoster.mockImplementation(async (projectId) => rosterFor(projectId))
    getTrends.mockImplementation(async (projectId) => trendsFor(projectId))
    getTeamMetrics.mockImplementation(async (key) => metricsFor(key))
    switchProject('alpha')
    await settle()
    filterState().selectedTeamKeys.value = []
  })

  describe('Trends', () => {
    it('drops selected teams and their series when the project changes, and does not restore them on return', async () => {
      const wrapper = mountReport(TrendsReport)
      await settle()
      const filters = filterState()
      filters.selectedTeamKeys.value = ['alpha-1', 'alpha-2']
      await settle()
      expect(trendSeries(wrapper)).toEqual(expect.arrayContaining(['Alpha One', 'Alpha Two']))

      switchProject('beta')
      await settle()
      expect(filters.selectedTeamKeys.value).toEqual([])
      expect(trendSeries(wrapper).every(l => l === 'Overall')).toBe(true)
      expect(wrapper.text()).not.toContain('alpha-')

      switchProject('alpha')
      await settle()
      expect(filters.selectedTeamKeys.value).toEqual([])
      expect(trendSeries(wrapper).every(l => l === 'Overall')).toBe(true)
    })

    it('does not let a late response for the previous project repopulate its state', async () => {
      const wrapper = mountReport(TrendsReport)
      await settle()
      const filters = filterState()
      filters.selectedTeamKeys.value = ['alpha-1', 'alpha-2']
      await settle()

      const late = deferred()
      getTrends.mockImplementationOnce(() => late.promise)
      switchProject('beta')
      await settle()
      switchProject('alpha')
      await settle()
      switchProject('beta')
      await settle()
      late.resolve(trendsFor('alpha'))
      await settle()

      expect(filters.selectedTeamKeys.value).toEqual([])
      expect(trendSeries(wrapper).every(l => l === 'Overall')).toBe(true)
    })

    it('keeps same-project selections and Aggregate/Compare behaviour', async () => {
      const wrapper = mountReport(TrendsReport)
      await settle()
      filterState().selectedTeamKeys.value = ['alpha-1', 'alpha-2']
      await settle()
      expect(trendSeries(wrapper)).toContain('Alpha One')

      const aggregate = wrapper.findAll('button').find(b => b.text() === 'Aggregate')
      await aggregate.trigger('click')
      expect(trendSeries(wrapper)).toContain('Selected Teams')
      expect(trendSeries(wrapper)).not.toContain('Alpha One')
    })
  })

  describe('Team Comparison', () => {
    async function runWithTeams(wrapper, keys) {
      filterState().selectedTeamKeys.value = keys
      await settle()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await settle()
    }

    it('clears charts and selected teams on project change, and does not restore them on return', async () => {
      const wrapper = mountReport(TeamComparisonReport)
      await settle()
      await runWithTeams(wrapper, ['alpha-1', 'alpha-2'])
      expect(wrapper.find('[data-testid="report-chart"]').attributes('data-labels'))
        .toBe(JSON.stringify(['Alpha One', 'Alpha Two']))

      switchProject('beta')
      await settle()
      expect(filterState().selectedTeamKeys.value).toEqual([])
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)

      switchProject('alpha')
      await settle()
      expect(filterState().selectedTeamKeys.value).toEqual([])
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
    })

    it('does not render a run that resolves after the project changed', async () => {
      const wrapper = mountReport(TeamComparisonReport)
      await settle()
      const late = deferred()
      getTeamMetrics.mockImplementation(() => late.promise)
      await runWithTeams(wrapper, ['alpha-1', 'alpha-2'])

      switchProject('beta')
      await settle()
      switchProject('alpha')
      await settle()
      late.resolve(metricsFor('alpha-1'))
      await settle()

      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
      expect(filterState().selectedTeamKeys.value).toEqual([])
    })

    it('does not stay in the loading state when its run is superseded by a project change', async () => {
      const wrapper = mountReport(TeamComparisonReport)
      await settle()
      getTeamMetrics.mockImplementation(() => deferred().promise)
      await runWithTeams(wrapper, ['alpha-1'])
      expect(wrapper.text()).toContain('Loading...')

      switchProject('beta')
      await settle()
      expect(wrapper.text()).not.toContain('Loading...')
    })
  })

  describe('project change while no report is mounted', () => {
    it('does not carry the previous project\'s selection into a re-mounted Trends report', async () => {
      const first = mountReport(TrendsReport)
      await settle()
      filterState().selectedTeamKeys.value = ['alpha-1', 'alpha-2']
      await settle()
      first.unmount()

      switchProject('beta')
      await settle()
      const wrapper = mountReport(TrendsReport)
      await settle()

      expect(filterState().selectedTeamKeys.value).toEqual([])
      expect(trendSeries(wrapper).every(l => l === 'Overall')).toBe(true)
      expect(wrapper.text()).not.toContain('alpha-')
    })

    it('does not carry the previous project\'s selection into a re-mounted Team Comparison report', async () => {
      const first = mountReport(TeamComparisonReport)
      await settle()
      filterState().selectedTeamKeys.value = ['alpha-1', 'alpha-2']
      await settle()
      first.unmount()

      switchProject('beta')
      await settle()
      mountReport(TeamComparisonReport)
      await settle()

      expect(filterState().selectedTeamKeys.value).toEqual([])
    })
  })

  it('uses the roster the test drives (sanity)', async () => {
    switchProject('beta')
    await settle()
    expect(useRoster().teams.value.map(t => t.key)).toEqual(['beta-1', 'beta-2'])
  })
})
