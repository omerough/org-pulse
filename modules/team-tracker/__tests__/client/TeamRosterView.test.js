import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount as vtuMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import TeamRosterView from '../../client/views/TeamRosterView.vue'
import TeamMembersTable from '../../client/components/TeamMembersTable.vue'
import { getTeamMetrics, apiRequest } from '@shared/client/services/api'

// The project context is shared module state, so a leftover mounted view would
// keep reacting to later tests' project changes — track and unmount in afterEach.
let trackedWrappers = []
function mount(...args) {
  const wrapper = vtuMount(...args)
  trackedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  trackedWrappers.splice(0).forEach(w => w.unmount())
})

const canonicalTeam = {
  key: 'osac::team-1',
  displayKey: null,
  displayName: 'Model Serving',
  members: [
    { accountId: 'acc-1', name: 'Alice', customFields: {} },
    { accountId: 'acc-2', name: 'Bob', customFields: {} },
  ],
  teamId: 'team-1',
  metadata: {},
  description: null
}
const rosterTeams = ref([canonicalTeam])
const rosterDataValue = ref({ projectId: 'osac', teams: [], people: [] })
const rosterLoadingValue = ref(false)
const rosterPeopleValue = ref([])
const rosterAuxiliaryManagersValue = ref({})

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    teams: rosterTeams,
    rosterData: rosterDataValue,
    loading: rosterLoadingValue,
    multiTeamMembers: ref(new Set()),
    getTeamsForPerson: () => ['Model Serving'],
    reloadRoster: vi.fn(),
    people: rosterPeopleValue,
    auxiliaryManagers: rosterAuxiliaryManagersValue,
    managerNames: ref({})
  })
}))

vi.mock('@shared/client/services/api', () => ({
  getTeamMetrics: vi.fn(),
  apiRequest: vi.fn().mockResolvedValue({})
}))

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (moduleSlug, viewId, params = {}) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
      return `#/${moduleSlug}/${viewId}${qs ? '?' + qs : ''}`
    }
  })
}))

vi.mock('../../../../src/composables/useModules', () => ({
  useModules: () => ({
    enabledBuiltInSlugs: ref(['ai-impact', 'team-tracker'])
  })
}))

vi.mock('../../client/services/autofix-api.js', () => ({
  fetchAutofixData: vi.fn().mockResolvedValue({ issues: [], fetchedAt: null })
}))

// Mock chart dependencies
vi.mock('vue-chartjs', () => ({
  Doughnut: { template: '<div></div>', props: ['data', 'options'] },
  Bar: { template: '<div></div>', props: ['data', 'options'] },
  Line: { template: '<div></div>', props: ['data', 'options'] }
}))
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {}, Tooltip: {}, Legend: {}, BarElement: {}, BarController: {},
  CategoryScale: {}, LinearScale: {}, PointElement: {}, LineElement: {}, Filler: {}, Title: {}
}))

function mountView(teamKey = 'osac::team-1', extraParams = {}) {
  return mount(TeamRosterView, {
    global: {
      provide: {
        moduleNav: {
          params: ref({ teamKey, ...extraParams }),
          goBack: vi.fn(),
          navigateTo: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
}

describe('TeamRosterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterTeams.value = [canonicalTeam]
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'osac', teams: [], people: [] }
  })

  it('renders team header with name and member count', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Model Serving')
    expect(wrapper.text()).toContain('2 members')
  })

  it('renders the visible tabs', async () => {
    const wrapper = mountView()
    await flushPromises()
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).toEqual(['Overview', 'Delivery'])
  })

  // Autofix is temporarily hidden (HIDDEN_TAB_IDS in TeamRosterView.vue).
  it('does not render the temporarily hidden tabs', async () => {
    const wrapper = mountView()
    await flushPromises()
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).not.toContain('Autofix')
    expect(tabLabels).toHaveLength(2)
  })

  it('switches tabs when tab buttons are clicked', async () => {
    const wrapper = mountView()
    await flushPromises()

    const overviewTab = wrapper.findAll('nav button').find(b => b.text() === 'Overview')
    await overviewTab.trigger('click')

    expect(wrapper.text()).toContain('Team Members')
  })

  it.each(['backlog', 'allocation', 'autofix'])('falls back to Overview when the removed or hidden %s tab is requested via a stale URL param', async (tab) => {
    const wrapper = mountView('osac::team-1', { tab })
    await flushPromises()

    expect(wrapper.text()).toContain('Team Members')
    const activeLabel = wrapper.findAll('nav button').find(b => b.classes().some(c => c.includes('primary')))
    expect(activeLabel.text()).toBe('Overview')
  })

  it('exposes no admin or legacy write controls', async () => {
    const wrapper = mountView()
    await flushPromises()

    const labels = wrapper.findAll('button').map(b => b.text())
    expect(labels).not.toContain('Refresh')
    expect(labels).not.toContain('Add Member')
    expect(labels.join(' ')).not.toContain('Add board')
    expect(wrapper.text()).not.toContain('Remove from Team')
  })

  it('fetches team metrics only once when team resolution and roster-loading both settle in the same tick', async () => {
    // A key unused by any other test in this file: earlier tests' mounted
    // instances are never unmounted and share these module-level refs, so a
    // key already in use would let their watchers answer too.
    const raceTeam = {
      key: 'osac::race-team',
      displayKey: null,
      displayName: 'Race Team',
      members: [{ accountId: 'acc-9', name: 'Casey', customFields: {} }]
    }
    rosterTeams.value = []
    rosterLoadingValue.value = true
    mountView('osac::race-team')
    await flushPromises()

    expect(getTeamMetrics).not.toHaveBeenCalled()

    // Mirrors useRoster's fetchRoster(): rosterData/teams and loading flip
    // in the same synchronous turn, so both reactive effects land in one flush.
    rosterTeams.value = [raceTeam]
    rosterLoadingValue.value = false
    await flushPromises()

    expect(getTeamMetrics).toHaveBeenCalledTimes(1)
  })
})

describe('TeamRosterView — project-qualified team (normalized model)', () => {
  const projectTeam = {
    key: 'flightctl::team-1',
    displayKey: null,
    displayName: 'Core',
    members: [
      { accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }
    ],
    teamId: 'team-1',
    metadata: {},
    description: null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    rosterTeams.value = [projectTeam]
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }
  })

  function mountProjectView() {
    return mount(TeamRosterView, {
      global: {
        provide: {
          moduleNav: {
            params: ref({ teamKey: 'flightctl::team-1' }),
            goBack: vi.fn(),
            navigateTo: vi.fn(),
            updateParams: vi.fn()
          }
        }
      }
    })
  }

  it('renders the project team and its members without calling any legacy endpoint', async () => {
    const wrapper = mountProjectView()
    await flushPromises()

    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Ada Lovelace')

    expect(apiRequest).not.toHaveBeenCalled()
    // Delivery metrics are scoped by the roster's project.
    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
  })

  it('renders canonical delivery metrics via the project-qualified endpoint', async () => {
    getTeamMetrics.mockResolvedValue({
      available: true,
      memberCount: 1,
      aggregate: { resolvedCount: 5, resolvedPoints: 13, inProgressCount: 2, avgCycleTimeDays: 2.5 }
    })
    const wrapper = mountProjectView()
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
    expect(wrapper.text()).toContain('5')
  })

  it('links a project-qualified member by accountId, not by display name', async () => {
    const wrapper = mountProjectView()
    await flushPromises()

    const memberLink = wrapper.find('tbody a')
    expect(memberLink.attributes('href')).toContain('accountId=acc-1')
    expect(memberLink.attributes('href')).not.toContain('person=')
  })

  it('does not collapse two normalized members that share a displayName but have different accountIds', async () => {
    rosterTeams.value = [{
      ...projectTeam,
      members: [
        { accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} },
        { accountId: 'acc-2', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }
      ]
    }]
    const wrapper = mountProjectView()
    await flushPromises()

    expect(wrapper.text()).toContain('2 members')
    const memberLinks = wrapper.findAll('tbody a')
    expect(memberLinks.map(a => a.attributes('href'))).toEqual([
      expect.stringContaining('accountId=acc-1'),
      expect.stringContaining('accountId=acc-2')
    ])
  })

  describe('manager links', () => {
    const managedMember = (managerRef) => ({
      ...projectTeam.members[0], managerRef
    })

    function setProjectHash(projectId) {
      window.location.hash = projectId ? `#/team-tracker/team-detail?projectId=${projectId}` : '#/'
      window.dispatchEvent(new Event('urlchange'))
    }

    beforeEach(() => {
      setProjectHash('flightctl')
      rosterPeopleValue.value = [{ accountId: 'mgr-1', displayName: 'Roster Manager', active: true }]
      rosterAuxiliaryManagersValue.value = { 'ext-uid': { ldapUid: 'ext-uid', displayName: 'External Manager' } }
    })

    afterEach(() => {
      setProjectHash('')
      rosterPeopleValue.value = []
      rosterAuxiliaryManagersValue.value = {}
    })

    async function managerCell(managerRef) {
      rosterTeams.value = [{ ...projectTeam, members: [managedMember(managerRef)] }]
      const wrapper = mountProjectView()
      await flushPromises()
      return wrapper.findComponent(TeamMembersTable).findAll('tbody tr')[0].findAll('td')[1]
    }

    it('links a roster manager by accountId', async () => {
      const cell = await managerCell({ kind: 'roster', accountId: 'mgr-1' })

      expect(cell.text()).toBe('Roster Manager')
      expect(cell.find('a').attributes('href')).toContain('accountId=mgr-1')
    })

    it('links an external manager to the external profile by ldapUid', async () => {
      const cell = await managerCell({ kind: 'external', ldapUid: 'ext-uid' })

      expect(cell.text()).toBe('External Manager')
      const href = cell.find('a').attributes('href')
      expect(href).toContain('person-detail')
      expect(href).toContain('ldapUid=ext-uid')
      expect(href).toContain('projectId=flightctl')
    })

    it('keeps an unresolved manager as text', async () => {
      const cell = await managerCell({ kind: 'unresolved', reason: 'no-match' })

      expect(cell.text()).toBe('—')
      expect(cell.find('a').exists()).toBe(false)
    })
  })

  it('requests nothing while the roster is still resolving mid project-switch', async () => {
    rosterLoadingValue.value = true
    rosterDataValue.value = null
    rosterTeams.value = []

    const wrapper = mountProjectView()
    await flushPromises()

    expect(getTeamMetrics).not.toHaveBeenCalled()

    // The project's roster resolves.
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }
    rosterTeams.value = [projectTeam]
    await flushPromises()

    expect(wrapper.text()).toContain('Core')
    expect(apiRequest).not.toHaveBeenCalled()
    // Delivery metrics are now fetched, scoped to the resolved project.
    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
  })
})

// An older in-flight request can resolve after a newer one; the stale
// response must never overwrite the newer, already-committed result.
describe('TeamRosterView — stale team metrics requests (OSAC-6322)', () => {
  function deferred() {
    let resolve
    const promise = new Promise(r => { resolve = r })
    return { promise, resolve }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drops a stale response from the previously selected team when a newer team-switch request resolves first', async () => {
    const teamA = { key: 'osac::team-a', displayKey: null, displayName: 'Team A', members: [{ accountId: 'p1', name: 'P1', customFields: {} }] }
    const teamB = { key: 'osac::team-b', displayKey: null, displayName: 'Team B', members: [{ accountId: 'p2', name: 'P2', customFields: {} }] }
    rosterTeams.value = [teamA, teamB]
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'osac', teams: [], people: [] }

    const deferredA = deferred()
    const deferredB = deferred()
    getTeamMetrics.mockImplementationOnce(() => deferredA.promise)
    getTeamMetrics.mockImplementationOnce(() => deferredB.promise)

    const params = ref({ teamKey: 'osac::team-a' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()

    // Switch to Team B before Team A's (older) request has resolved.
    params.value = { teamKey: 'osac::team-b' }
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(2)

    // The newer (Team B) request resolves first.
    deferredB.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 20, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    // The older (Team A) request resolves after -- must be dropped, not applied.
    deferredA.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 999, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).not.toContain('999')
  })

  it('drops a stale response from the previously selected project when a newer project-switch request resolves first', async () => {
    const projectTeam = {
      key: 'projswitch::core',
      displayKey: null,
      displayName: 'Core',
      members: [{ accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }],
      teamId: 'team-1',
      metadata: {},
      description: null
    }
    rosterTeams.value = [projectTeam]
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }

    const deferredFlightctl = deferred()
    const deferredSippy = deferred()
    getTeamMetrics.mockImplementationOnce(() => deferredFlightctl.promise)
    getTeamMetrics.mockImplementationOnce(() => deferredSippy.promise)

    const params = ref({ teamKey: 'projswitch::core' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledWith('projswitch::core', 'flightctl')

    // Mirror useRoster's project-switch sequence while the old request is
    // still in flight; same team key, different projectId.
    rosterTeams.value = []
    rosterLoadingValue.value = true
    rosterDataValue.value = null
    await flushPromises()

    rosterDataValue.value = { projectId: 'sippy', teams: [], people: [] }
    rosterTeams.value = [{ ...projectTeam }]
    rosterLoadingValue.value = false
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(2)
    expect(getTeamMetrics).toHaveBeenLastCalledWith('projswitch::core', 'sippy')

    // The newer (sippy) request resolves first.
    deferredSippy.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 20, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    // The older (flightctl) request resolves after -- must be dropped, not applied.
    deferredFlightctl.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 999, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).not.toContain('999')
  })

  it('retries after a failed fetch once a later trigger fires for the same team/project', async () => {
    const team = { key: 'osac::team-a', displayKey: null, displayName: 'Team A', members: [{ accountId: 'p1', name: 'P1', customFields: {} }] }
    rosterTeams.value = [team]
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'osac', teams: [], people: [] }

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getTeamMetrics.mockRejectedValueOnce(new Error('network error'))
    getTeamMetrics.mockResolvedValueOnce({ available: true, memberCount: 1, aggregate: { resolvedCount: 42, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })

    const params = ref({ teamKey: 'osac::team-a' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(1)

    // Simulate a later roster reload for the same team/project (e.g. an explicit
    // refresh) -- the earlier failure must not block this retry.
    rosterLoadingValue.value = true
    await flushPromises()
    rosterLoadingValue.value = false
    await flushPromises()

    expect(getTeamMetrics).toHaveBeenCalledTimes(2)

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')
    expect(wrapper.text()).toContain('42')

    consoleErrorSpy.mockRestore()
  })
})

describe('TeamRosterView — legacy team links in project context', () => {
  const team = (id, displayName) => ({
    key: `osac::${id}`, displayKey: null, displayName, members: [], teamId: id, metadata: {}, description: null
  })

  function setProjectTeams(teams) {
    rosterTeams.value = teams
    rosterDataValue.value = { projectId: 'osac', teams: teams.map(t => ({ key: t.key, id: t.teamId, displayName: t.displayName })), people: [] }
  }

  const mounted = []

  // updateParams applies to the params ref like the shell router does.
  function mountWithKey(teamKey) {
    const params = ref({ teamKey })
    const nav = {
      params,
      goBack: vi.fn(),
      navigateTo: vi.fn(),
      updateParams: vi.fn(next => { params.value = { ...params.value, ...next } })
    }
    const wrapper = mount(TeamRosterView, { global: { provide: { moduleNav: nav } } })
    mounted.push(wrapper)
    return { wrapper, nav }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    rosterLoadingValue.value = false
  })

  // Mounted views share the roster mocks and would react to later tests' state.
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
  })

  it('rewrites a legacy name key to the canonical key before the metrics call', async () => {
    setProjectTeams([team('t-1', 'Platform'), team('t-2', 'Infrastructure')])

    const { wrapper, nav } = mountWithKey('osac::Platform')
    await flushPromises()

    expect(nav.updateParams).toHaveBeenCalledTimes(1)
    expect(nav.updateParams).toHaveBeenCalledWith({ teamKey: 'osac::t-1' }, { push: false })
    expect(getTeamMetrics).toHaveBeenCalledTimes(1)
    expect(getTeamMetrics).toHaveBeenCalledWith('osac::t-1', 'osac')
    expect(wrapper.text()).toContain('Platform')
  })

  it('rewrites a case-variant display key', async () => {
    setProjectTeams([team('t-1', 'Platform')])

    const { nav } = mountWithKey('OSAC::Platform')
    await flushPromises()

    expect(nav.updateParams).toHaveBeenCalledWith({ teamKey: 'osac::t-1' }, { push: false })
    expect(getTeamMetrics).toHaveBeenCalledTimes(1)
  })

  it('waits for the roster before resolving', async () => {
    rosterLoadingValue.value = true
    rosterDataValue.value = null
    rosterTeams.value = []

    const { nav } = mountWithKey('osac::Platform')
    await flushPromises()
    expect(nav.updateParams).not.toHaveBeenCalled()

    rosterLoadingValue.value = false
    setProjectTeams([team('t-1', 'Platform')])
    await flushPromises()

    expect(nav.updateParams).toHaveBeenCalledWith({ teamKey: 'osac::t-1' }, { push: false })
    expect(getTeamMetrics).toHaveBeenCalledTimes(1)
    expect(getTeamMetrics).toHaveBeenCalledWith('osac::t-1', 'osac')
  })

  it.each([
    ['a suffix that is one team ID and another team displayName', [team('Platform', 'Core'), team('t-2', 'Platform')], 'OSAC::Platform'],
    ['a bare name that is one team ID and another team displayName', [team('Platform', 'Core'), team('t-2', 'Platform')], 'Platform'],
    ['several teams sharing the displayName', [team('t-1', 'Platform'), team('t-2', 'Platform')], 'osac::Platform'],
    ['an unknown team name', [team('t-1', 'Platform')], 'osac::Nope']
  ])('renders not-found and does not rewrite or fetch metrics for %s', async (_label, teams, teamKey) => {
    setProjectTeams(teams)

    const { wrapper, nav } = mountWithKey(teamKey)
    await flushPromises()

    expect(wrapper.find('[data-testid="team-not-found"]').exists()).toBe(true)
    expect(nav.updateParams).not.toHaveBeenCalled()
    expect(getTeamMetrics).not.toHaveBeenCalled()
  })

  it('keeps an exact canonical key even when another team displayName collides with its suffix', async () => {
    setProjectTeams([team('Platform', 'Core'), team('t-2', 'Platform')])

    const { wrapper, nav } = mountWithKey('osac::Platform')
    await flushPromises()

    expect(nav.updateParams).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Core')
    expect(getTeamMetrics).toHaveBeenCalledWith('osac::Platform', 'osac')
  })

  it('does not rewrite or fetch metrics while no roster has loaded', async () => {
    rosterDataValue.value = null
    rosterTeams.value = []

    const { wrapper, nav } = mountWithKey('osac::Platform')
    await flushPromises()

    expect(nav.updateParams).not.toHaveBeenCalled()
    expect(getTeamMetrics).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="team-not-found"]').exists()).toBe(true)
  })
})
