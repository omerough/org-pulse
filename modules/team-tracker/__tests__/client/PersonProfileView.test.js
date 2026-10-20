import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import PersonProfileView from '../../client/views/PersonProfileView.vue'

const rosterPeople = ref([])
const rosterTeamsValue = ref([])
const rosterDataValue = ref(null)
const rosterLoadingValue = ref(false)
const isAdminValue = ref(false)
const auxiliaryManagersValue = ref({})
const mockLoadGitlabStats = vi.fn()
const projectIdValue = ref('flightctl')

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    getTeamsForPerson: () => [],
    teams: rosterTeamsValue,
    rosterData: rosterDataValue,
    loading: rosterLoadingValue,
    getPersonByAccountId: (accountId) => rosterPeople.value.find(p => p.accountId === accountId) || null,
    people: rosterPeople,
    auxiliaryManagers: auxiliaryManagersValue
  })
}))

vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectIdValue
}))

vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ isAdmin: isAdminValue, refresh: vi.fn() })
}))

vi.mock('@shared/client/composables/useGithubStats.js', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('@shared/client/composables/useGitlabStats.js', () => ({
  useGitlabStats: () => ({ getContributions: () => null, loadGitlabStats: mockLoadGitlabStats })
}))

vi.mock('@shared/client/composables/usePermissions.js', () => ({
  usePermissions: () => ({ canEdit: () => false, refresh: vi.fn() })
}))

vi.mock('@shared/client/composables/useImpersonation.js', () => ({
  useImpersonation: () => ({ startImpersonating: vi.fn() })
}))

vi.mock('@shared/client/composables/useFieldDefinitions.js', () => ({
  useFieldDefinitions: () => ({
    definitions: ref({ personFields: [] }),
    fetchDefinitions: vi.fn().mockResolvedValue({})
  })
}))

vi.mock('../../client/composables/useManagerTutorial', () => ({
  useManagerTutorial: () => ({ resumeTourIfActive: vi.fn(), destroyTour: vi.fn() })
}))

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'

function mountView(params) {
  return mount(PersonProfileView, {
    global: {
      provide: {
        moduleNav: {
          params: ref(params),
          goBack: vi.fn(),
          navigateTo: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
}

describe('PersonProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectIdValue.value = 'flightctl'
    rosterPeople.value = []
    rosterTeamsValue.value = []
    rosterDataValue.value = null
    rosterLoadingValue.value = false
    isAdminValue.value = false
    auxiliaryManagersValue.value = {}
  })

  it('resolves a project-qualified person by accountId without calling the legacy registry endpoint', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: 'ada@example.com',
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada@example.com')

    for (const call of apiRequest.mock.calls) {
      expect(call[0]).not.toContain('/registry/people/')
    }
  })

  it('does not fall back to a display-name lookup when accountId is present', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    // An OSAC person happens to share a display name; accountId must win.
    const wrapper = mountView({ accountId: 'acc-1', person: 'Ada Lovelace' })
    await flushPromises()

    expect(apiRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ada Lovelace')
  })

  it('hides admin mutation actions (impersonate/reactivate/purge) for a project-qualified person', async () => {
    isAdminValue.value = true
    rosterPeople.value = [
      {
        key: 'flightctl::acc-2',
        projectId: 'flightctl',
        accountId: 'acc-2',
        displayName: 'Inactive Person',
        active: false,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-2' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Impersonate')
    expect(wrapper.text()).not.toContain('Reactivate')
    expect(wrapper.text()).not.toContain('Purge')
  })

  it('re-resolves instead of showing a stale person when the roster changes underneath the view (project switch)', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    // Simulate a project switch: roster no longer contains this accountId.
    projectIdValue.value = 'other-project'
    rosterPeople.value = []
    rosterDataValue.value = { projectId: 'other-project', teams: [], people: [] }
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Person not found')
  })

  it('stays loading (not "Person not found") while useRoster clears rosterData mid project-switch', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    // useRoster clears rosterData synchronously before the new project's fetch resolves.
    projectIdValue.value = 'other-project'
    rosterDataValue.value = null
    rosterLoadingValue.value = true
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Person not found')

    // The new project's roster finishes loading without this accountId.
    rosterPeople.value = []
    rosterDataValue.value = { projectId: 'other-project', teams: [], people: [] }
    rosterLoadingValue.value = false
    await flushPromises()

    expect(wrapper.text()).toContain('Person not found')
  })

  it('surfaces enriched github/gitlab identities for a project-qualified person', async () => {
    isAdminValue.value = true
    rosterPeople.value = [
      {
        key: 'flightctl::acc-3',
        projectId: 'flightctl',
        accountId: 'acc-3',
        displayName: 'Grace Hopper',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {
          github: { username: 'ghopper', source: 'ldap' },
          gitlab: { username: 'ghopper-gl', source: 'ldap' }
        }
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-3' })
    await flushPromises()

    expect(wrapper.text()).toContain('ghopper')
    expect(wrapper.text()).toContain('ghopper-gl')
    // Edit/remove controls stay OSAC-only even for an admin viewing a project person.
    expect(wrapper.find('button[title="Edit"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Set"]').exists()).toBe(false)
  })

  it('shows "Not set" for a project-qualified person with no published identities', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-4',
        projectId: 'flightctl',
        accountId: 'acc-4',
        displayName: 'No Identities',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-4' })
    await flushPromises()

    const notSet = wrapper.findAll('span').filter(s => s.text() === 'Not set')
    expect(notSet.length).toBe(2)
  })

  it('leaves OSAC legacy behavior unchanged (resolves by uid via the registry endpoint)', async () => {
    apiRequest.mockImplementation((url) => {
      if (url.includes('/registry/people/u1')) {
        return Promise.resolve({
          person: {
            uid: 'u1',
            name: 'Bob Builder',
            status: 'active',
            email: 'bob@example.com',
            orgType: 'engineering'
          },
          managerChain: [],
          directReports: [],
          associatedTeams: []
        })
      }
      if (url.includes('/person/')) {
        return Promise.resolve({ resolved: { issues: [] }, inProgress: { issues: [] } })
      }
      return Promise.resolve({})
    })

    const wrapper = mountView({ uid: 'u1' })
    await flushPromises()

    expect(wrapper.text()).toContain('Bob Builder')
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/registry/people/u1'))
  })

  describe('project-qualified manager hierarchy', () => {
    function mountViewWithNav(params) {
      const navigateTo = vi.fn()
      const wrapper = mount(PersonProfileView, {
        global: {
          provide: {
            moduleNav: { params: ref(params), goBack: vi.fn(), navigateTo, updateParams: vi.fn() }
          }
        }
      })
      return { wrapper, navigateTo }
    }

    function person(accountId, overrides = {}) {
      return {
        accountId,
        displayName: accountId,
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        managerRef: null,
        geo: null,
        identities: {},
        ...overrides
      }
    }

    it('renders the manager chain and direct reports, and navigates by accountId', async () => {
      rosterPeople.value = [
        person('ic-1', { displayName: 'IC One', managerRef: { kind: 'roster', accountId: 'mgr-1' } }),
        person('mgr-1', { displayName: 'Manager One' }),
        person('report-1', { displayName: 'Report One', title: 'Engineer', managerRef: { kind: 'roster', accountId: 'ic-1' } })
      ]
      rosterDataValue.value = {
        projectId: 'flightctl',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'fresh', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }

      const { wrapper, navigateTo } = mountViewWithNav({ accountId: 'ic-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('Manager One')
      expect(wrapper.text()).toContain('Report One')

      await wrapper.findAll('button').find(b => b.text() === 'Manager One').trigger('click')
      expect(navigateTo).toHaveBeenCalledWith('person-detail', { accountId: 'mgr-1' })

      await wrapper.findAll('button').find(b => b.text().includes('Report One')).trigger('click')
      expect(navigateTo).toHaveBeenCalledWith('person-detail', { accountId: 'report-1' })
    })

    it('renders an external auxiliary manager as non-navigable text', async () => {
      rosterPeople.value = [
        person('ic-1', { displayName: 'IC One', managerRef: { kind: 'external', ldapUid: 'director1' } })
      ]
      auxiliaryManagersValue.value = {
        director1: { ldapUid: 'director1', displayName: 'Director One', managerRef: null }
      }
      rosterDataValue.value = {
        projectId: 'flightctl',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'fresh', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }

      const wrapper = mountView({ accountId: 'ic-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('Director One')
      expect(wrapper.findAll('button').find(b => b.text() === 'Director One')).toBeUndefined()
    })

    it('reports the hierarchy as unavailable, not as an empty org, when enrichment never joined', async () => {
      rosterPeople.value = [person('ic-1', { displayName: 'IC One' })]
      // No `enrichment` key at all: the publication never joined.
      rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

      const wrapper = mountView({ accountId: 'ic-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('Manager hierarchy unavailable')
      expect(wrapper.text()).toContain('Direct reports unavailable')
      expect(wrapper.text()).not.toContain('No managers found')
    })

    it('flags an unresolved chain as incomplete and surfaces a stale indicator, without claiming the org has no managers', async () => {
      rosterPeople.value = [
        person('ic-1', { displayName: 'IC One', managerRef: { kind: 'roster', accountId: 'ghost' } })
      ]
      rosterDataValue.value = {
        projectId: 'flightctl',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'stale', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }

      const wrapper = mountView({ accountId: 'ic-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('stale')
      expect(wrapper.text()).toContain('Chain incomplete beyond this point')
      expect(wrapper.text()).not.toContain('No managers found')
    })

    it('isolates hierarchy data per project: the same accountId in two projects does not leak managers', async () => {
      rosterPeople.value = [
        person('shared-id', { displayName: 'Shared Person', managerRef: { kind: 'roster', accountId: 'mgr-flightctl' } }),
        person('mgr-flightctl', { displayName: 'FlightCtl Manager' })
      ]
      rosterDataValue.value = {
        projectId: 'flightctl',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'fresh', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }

      const wrapper = mountView({ accountId: 'shared-id' })
      await flushPromises()
      expect(wrapper.text()).toContain('FlightCtl Manager')

      projectIdValue.value = 'other-project'
      rosterPeople.value = [
        person('shared-id', { displayName: 'Shared Person', managerRef: { kind: 'roster', accountId: 'mgr-other' } }),
        person('mgr-other', { displayName: 'Other Project Manager' })
      ]
      rosterDataValue.value = {
        projectId: 'other-project',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'fresh', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }
      await flushPromises()

      expect(wrapper.text()).toContain('Other Project Manager')
      expect(wrapper.text()).not.toContain('FlightCtl Manager')
    })

    it('clears a prior person\'s manager chain and direct reports while the next one is still resolving', async () => {
      rosterPeople.value = [
        person('ic-1', { displayName: 'IC One', managerRef: { kind: 'roster', accountId: 'mgr-1' } }),
        person('mgr-1', { displayName: 'Manager One' })
      ]
      rosterDataValue.value = {
        projectId: 'flightctl',
        teams: [],
        people: rosterPeople.value,
        enrichment: { state: 'fresh', partial: false, generatedAt: '2026-01-01T00:00:00Z' }
      }

      const wrapper = mountView({ accountId: 'ic-1' })
      await flushPromises()
      expect(wrapper.text()).toContain('Manager One')

      // Roster clears mid project-switch, before the next project's publication lands.
      rosterDataValue.value = null
      rosterLoadingValue.value = true
      await flushPromises()

      expect(wrapper.text()).not.toContain('Manager One')
    })
  })
})
