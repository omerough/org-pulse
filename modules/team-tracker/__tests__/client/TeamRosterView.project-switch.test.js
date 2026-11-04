import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import TeamRosterView from '../../client/views/TeamRosterView.vue'
import { getRoster, getTeamMetrics, apiRequest } from '@shared/client/services/api'

// Real useRoster, useProjectId and useProjectDisplayName; only HTTP is mocked.
vi.mock('@shared/client/services/api', () => ({
  getRoster: vi.fn(),
  getTeamMetrics: vi.fn().mockResolvedValue(null),
  apiRequest: vi.fn()
}))

const PROJECTS = [
  { projectId: 'osac', displayName: 'Open Source Agent Cloud' },
  { projectId: 'flightctl', displayName: 'FlightCtl' }
]

const ROSTERS = {
  osac: {
    projectId: 'osac',
    teams: [{ key: 'osac::core', id: 'core', displayName: 'OSAC Core', memberAccountIds: ['a1', 'a2'] }],
    people: [
      { accountId: 'a1', displayName: 'Alice', active: true },
      { accountId: 'a2', displayName: 'Bob', active: true }
    ]
  },
  flightctl: {
    projectId: 'flightctl',
    teams: [{ key: 'flightctl::core', id: 'core', displayName: 'FlightCtl Core', memberAccountIds: ['f1'] }],
    people: [{ accountId: 'f1', displayName: 'Fay', active: true }]
  }
}

function setProjectHash(projectId) {
  window.location.hash = projectId ? `#/team-tracker/team-detail?projectId=${projectId}` : '#/'
  window.dispatchEvent(new Event('urlchange'))
}

function header(wrapper) {
  const h2 = wrapper.find('h2')
  return {
    title: h2.text(),
    subtitle: h2.element.nextElementSibling.textContent.replace(/\s+/g, ' ').trim()
  }
}

let wrapper
let pendingRosters

function mountView(teamKey) {
  const params = ref({ teamKey })
  wrapper = mount(TeamRosterView, {
    global: {
      provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } },
      stubs: { TeamOverviewTab: true, TeamDeliveryTab: true, TeamAutofixTab: true }
    }
  })
  return params
}

describe('TeamRosterView — project switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingRosters = {}
    apiRequest.mockImplementation(async path => (path === '/projects' ? { projects: PROJECTS } : {}))
    getRoster.mockImplementation(projectId => new Promise(resolve => {
      pendingRosters[projectId] = () => resolve(ROSTERS[projectId])
    }))
  })

  afterEach(() => {
    wrapper?.unmount()
    setProjectHash('')
  })

  it('never renders the previous project\'s team under the new project label', async () => {
    setProjectHash('osac')
    const params = mountView('osac::core')
    pendingRosters.osac()
    await flushPromises()

    expect(header(wrapper)).toEqual({ title: 'OSAC Core', subtitle: 'Open Source Agent Cloud · 2 members' })
    expect(getTeamMetrics).toHaveBeenLastCalledWith('osac::core', 'osac')

    // The new project's roster is still in flight.
    setProjectHash('flightctl')
    await nextTick()

    expect(wrapper.find('h2').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('OSAC Core')
    expect(wrapper.find('.animate-spin').exists()).toBe(true)

    // The previous project's team key does not resolve in the new roster.
    pendingRosters.flightctl()
    await flushPromises()

    expect(wrapper.find('[data-testid="team-not-found"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('OSAC Core')
    expect(getTeamMetrics).not.toHaveBeenCalledWith('osac::core', 'flightctl')

    params.value = { teamKey: 'flightctl::core' }
    await flushPromises()

    expect(header(wrapper)).toEqual({ title: 'FlightCtl Core', subtitle: 'FlightCtl · 1 members' })
    expect(getTeamMetrics).toHaveBeenLastCalledWith('flightctl::core', 'flightctl')
  })
})
