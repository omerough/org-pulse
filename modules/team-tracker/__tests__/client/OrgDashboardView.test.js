import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import OrgDashboardView from '../../client/views/OrgDashboardView.vue'

vi.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<canvas></canvas>' }
}))
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: 'ArcElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

const projectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const projectLabels = { acme: 'Acme Platform', flightctl: 'Flight Control' }
vi.mock('../../client/composables/useProjectDisplayName', () => ({
  useProjectDisplayName: () => computed(() => projectLabels[projectId.value] ?? projectId.value)
}))

const rosterData = ref(null)
const rosterPeople = ref([])
const rosterTeams = ref([])
const rosterLoading = ref(false)
const rosterError = ref(null)
const mockLoadRoster = vi.fn()

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    rosterData,
    people: rosterPeople,
    teams: rosterTeams,
    loading: rosterLoading,
    error: rosterError,
    loadRoster: mockLoadRoster
  })
}))

const navigateTo = vi.fn()
let currentWrapper = null

// Keeps each test's instance watchers from leaking into later tests, since
// projectId is a shared ref and an un-unmounted watch(projectId, ...) keeps firing.
function mountView(params = {}) {
  currentWrapper = mount(OrgDashboardView, {
    global: {
      provide: {
        moduleNav: {
          params: ref(params),
          navigateTo,
          goBack: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
  return currentWrapper
}

// Member shared across two teams, plus one unassigned active member and one inactive member.
function flightctlRoster() {
  return {
    projectId: 'flightctl',
    availability: 'available',
    reason: null,
    teams: [
      { key: 'flightctl::team-1', displayName: 'Core', id: 'team-1', memberAccountIds: ['acc-1', 'acc-2'] },
      { key: 'flightctl::team-2', displayName: 'Platform', id: 'team-2', memberAccountIds: ['acc-1'] }
    ],
    people: [
      { accountId: 'acc-1', displayName: 'Ada Lovelace', active: true, title: 'Senior Engineer', teamIds: ['team-1', 'team-2'] },
      { accountId: 'acc-2', displayName: 'Grace Hopper', active: true, title: 'Engineering Manager', teamIds: ['team-1'] },
      { accountId: 'acc-3', displayName: 'Unassigned Person', active: true, title: null, teamIds: [] },
      { accountId: 'acc-4', displayName: 'Former Engineer', active: false, title: 'Engineer', teamIds: [] }
    ]
  }
}

describe('OrgDashboardView', () => {
  afterEach(() => {
    currentWrapper?.unmount()
    currentWrapper = null
  })

  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = 'flightctl'
    rosterData.value = null
    rosterPeople.value = []
    rosterTeams.value = []
    rosterLoading.value = false
    rosterError.value = null
  })

  it('loads the project roster and renders the project dashboard', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(mockLoadRoster).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Flight Control Dashboard')
  })

  it('shows the project display name, not the raw ID, in the dashboard heading', async () => {
    projectId.value = 'acme'
    rosterData.value = { ...flightctlRoster(), projectId: 'acme' }
    rosterPeople.value = rosterData.value.people

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('h2').text()).toBe('Acme Platform Dashboard')
  })

  it('falls back to the raw ID for a project without a registered display name', async () => {
    projectId.value = 'unregistered'
    rosterData.value = { ...flightctlRoster(), projectId: 'unregistered' }
    rosterPeople.value = rosterData.value.people

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('h2').text()).toBe('unregistered Dashboard')
  })

  it('computes unique active headcount across teams and includes unassigned active people, excluding inactive ones', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    // acc-1, acc-2, acc-3 (unassigned) are active; acc-4 is inactive and excluded.
    expect(wrapper.findAll('button p.text-3xl')[1].text()).toBe('3')
  })

  it('reports the actual number of published teams and does not fabricate PRD/component metrics', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('button p.text-3xl')[0].text()).toBe('2')
    expect(wrapper.text()).not.toContain('Components')
    expect(wrapper.text()).not.toContain('Open PRDs')
    expect(wrapper.text()).not.toContain('PRD Backlog')
  })

  it('role breakdown total reconciles with the headcount stat tile', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    const headcountStat = wrapper.findAll('button p.text-3xl')[1].text()
    const totalRow = wrapper.findAll('tr').find(r => r.text().startsWith('Total'))
    expect(totalRow.findAll('td')[1].text()).toBe(headcountStat)
  })

  it('navigates to the canonical team-detail route using team.key', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    const teamRow = wrapper.findAll('tbody tr').find(r => r.text().includes('Core'))
    await teamRow.trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('team-detail', { teamKey: 'flightctl::team-1' })
  })

  it('shows an unavailable state', async () => {
    projectId.value = 'flightctl'
    rosterData.value = { projectId: 'flightctl', availability: 'unavailable', reason: 'not-collected', teams: [], people: [] }
    rosterPeople.value = []
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No current roster publication is available')
  })

  it('shows an empty state when the roster has no active people', async () => {
    projectId.value = 'flightctl'
    rosterData.value = { projectId: 'flightctl', availability: 'empty', reason: null, teams: [], people: [] }
    rosterPeople.value = []
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No Active People Published')
  })

  it('does not retain stale project data when switching Flight Control -> Acme -> Flight Control', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] }
    ]

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Flight Control Dashboard')
    mockLoadRoster.mockClear()

    // useRoster clears its state on switch before the new roster arrives; the
    // stale flightctl roster must not render under the new project.
    projectId.value = 'acme'
    rosterData.value = flightctlRoster()
    await flushPromises()
    expect(mockLoadRoster).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Acme Platform Dashboard')
    expect(wrapper.text()).not.toContain('Core')
    expect(wrapper.find('table').exists()).toBe(false)

    // Back to flightctl with a different headcount; the old count (3) never reappears.
    projectId.value = 'flightctl'
    rosterData.value = {
      ...flightctlRoster(),
      people: [{ accountId: 'acc-9', displayName: 'New Hire', active: true, title: 'Engineer', teamIds: [] }]
    }
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = []
    await flushPromises()

    expect(wrapper.text()).toContain('Flight Control Dashboard')
    expect(wrapper.findAll('button p.text-3xl')[1].text()).toBe('1')
  })

  it('shows a loading spinner while the roster loads and no stale panel', async () => {
    rosterLoading.value = true
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('shows the unavailable state on a roster error', async () => {
    rosterError.value = 'boom'
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No current roster publication is available')
  })

  it('navigates to the team directory and people list without legacy org params', async () => {
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = []
    const wrapper = mountView()
    await flushPromises()

    const [teamsTile, peopleTile] = wrapper.findAll('button').filter(b => b.find('p.text-3xl').exists())
    await teamsTile.trigger('click')
    await peopleTile.trigger('click')
    expect(navigateTo).toHaveBeenNthCalledWith(1, 'home')
    expect(navigateTo).toHaveBeenNthCalledWith(2, 'people')
  })
})
