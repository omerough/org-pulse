import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ManageView from '../../client/views/ManageView.vue'
import OrgExplorerView from '../../client/views/OrgExplorerView.vue'
import UnassignedPeople from '../../client/components/UnassignedPeople.vue'

const projectId = ref('')
const isAdmin = ref(true)
const fetchUnassigned = vi.fn()
const fetchTeams = vi.fn()

vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin,
    isTeamAdmin: ref(false),
    isManager: ref(false),
    canEdit: () => true,
    loading: ref(false)
  })
}))

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({ trees: [] })
}))

vi.mock('@shared/client/composables/useTeams', () => ({
  useTeams: () => ({
    teams: ref([]),
    demoToast: ref(null),
    fetchTeams,
    assignMembersBulk: vi.fn(),
    fetchUnassigned
  })
}))

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({ reloadRoster: vi.fn() })
}))

import { apiRequest } from '@shared/client/services/api.js'

const navigateTo = vi.fn()

const views = [
  ['ManageView', ManageView, 'Teams'],
  ['OrgExplorerView', OrgExplorerView, 'No Org Data'],
  ['UnassignedPeople', UnassignedPeople, 'Unassigned People']
]

const mountedWrappers = []

function mountView(component) {
  const wrapper = mount(component, {
    global: {
      provide: { moduleNav: { params: ref({}), navigateTo, goBack: vi.fn(), updateParams: vi.fn() } },
      stubs: {
        TeamManagement: true,
        FieldDefinitionManager: true,
        FieldOptionsManager: true,
        DataQualityTab: true,
        FieldExceptionsTab: true
      }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('legacy-only views in project context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = ''
    isAdmin.value = true
    fetchUnassigned.mockResolvedValue([])
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach(w => w.unmount())
  })

  it.each(views)('%s renders the unavailable state, makes no legacy fetch, and links home', async (_name, component) => {
    projectId.value = 'osac'

    const wrapper = mountView(component)
    await flushPromises()

    expect(wrapper.find('[data-testid="not-available-for-project"]').text()).toContain('Not available for project rosters.')
    expect(apiRequest).not.toHaveBeenCalled()
    expect(fetchUnassigned).not.toHaveBeenCalled()
    expect(fetchTeams).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="not-available-for-project"] button').trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('home')
  })

  it.each(views)('%s is unchanged when no project is selected', async (_name, component, marker) => {
    const wrapper = mountView(component)
    await flushPromises()

    expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(marker)
  })

  it('OrgExplorerView and UnassignedPeople load their legacy data when no project is selected', async () => {
    mountView(OrgExplorerView)
    mountView(UnassignedPeople)
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/team-tracker/registry/orgs')
    expect(fetchUnassigned).toHaveBeenCalledWith('all')
    expect(fetchTeams).toHaveBeenCalled()
  })

  describe('while mounted across a project transition', () => {
    const loadingViews = [
      ['OrgExplorerView', OrgExplorerView, () => apiRequest],
      ['UnassignedPeople', UnassignedPeople, () => fetchUnassigned]
    ]

    it.each(loadingViews)('%s loads legacy data when the selected project is cleared', async (_name, component, fetchSpy) => {
      projectId.value = 'osac'
      const wrapper = mountView(component)
      await flushPromises()
      expect(fetchSpy()).not.toHaveBeenCalled()

      projectId.value = ''
      await flushPromises()

      expect(fetchSpy()).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(false)
    })

    it.each(loadingViews)('%s shows the guard without another fetch when a project is selected', async (_name, component, fetchSpy) => {
      const wrapper = mountView(component)
      await flushPromises()
      expect(fetchSpy()).toHaveBeenCalledTimes(1)

      projectId.value = 'osac'
      await flushPromises()

      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(true)
      expect(fetchSpy()).toHaveBeenCalledTimes(1)
    })

    describe('with an older legacy load still in flight when the project round-trips', () => {
      function deferred() {
        let resolve, reject
        const promise = new Promise((res, rej) => { resolve = res; reject = rej })
        return { promise, resolve, reject }
      }

      const orgTree = name => ({ trees: [{ uid: name, name, children: [] }] })

      const staleScenarios = [
        [
          'OrgExplorerView',
          OrgExplorerView,
          () => apiRequest,
          name => orgTree(name),
          (wrapper, name) => wrapper.text().includes(name)
        ],
        [
          'UnassignedPeople',
          UnassignedPeople,
          () => fetchUnassigned,
          name => [{ uid: name, name, title: 't' }],
          (wrapper, name) => wrapper.text().includes(name)
        ]
      ]

      async function mountWithOlderLoadInFlight(component, fetchSpy) {
        const older = deferred()
        const newer = deferred()
        fetchSpy().mockReset()
        fetchSpy().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
        const wrapper = mountView(component)
        projectId.value = 'osac'
        await flushPromises()
        projectId.value = ''
        await flushPromises()
        expect(fetchSpy()).toHaveBeenCalledTimes(2)
        return { wrapper, older, newer }
      }

      it.each(staleScenarios)('%s keeps the newer response when the older one settles last', async (_n, component, fetchSpy, payload, shows) => {
        const { wrapper, older, newer } = await mountWithOlderLoadInFlight(component, fetchSpy)

        newer.resolve(payload('Fresh'))
        await flushPromises()
        older.resolve(payload('Stale'))
        await flushPromises()

        expect(shows(wrapper, 'Fresh')).toBe(true)
        expect(shows(wrapper, 'Stale')).toBe(false)
      })

      it.each(staleScenarios)('%s keeps the newer response when the older request fails last', async (_n, component, fetchSpy, payload, shows) => {
        const { wrapper, older, newer } = await mountWithOlderLoadInFlight(component, fetchSpy)

        newer.resolve(payload('Fresh'))
        await flushPromises()
        older.reject(new Error('aborted'))
        await flushPromises()

        expect(shows(wrapper, 'Fresh')).toBe(true)
      })

      it.each(staleScenarios)('%s stays loading until the newer request settles', async (_n, component, fetchSpy, payload, shows) => {
        const { wrapper, older, newer } = await mountWithOlderLoadInFlight(component, fetchSpy)

        older.resolve(payload('Stale'))
        await flushPromises()
        expect(shows(wrapper, 'Stale')).toBe(false)

        newer.resolve(payload('Fresh'))
        await flushPromises()
        expect(shows(wrapper, 'Fresh')).toBe(true)
      })
    })

    it('UnassignedPeople loads teams when the selected project is cleared', async () => {
      projectId.value = 'osac'
      mountView(UnassignedPeople)
      await flushPromises()
      expect(fetchTeams).not.toHaveBeenCalled()

      projectId.value = ''
      await flushPromises()

      expect(fetchTeams).toHaveBeenCalledTimes(1)
    })

    it('ManageView swaps between the guard and the tabs as the project changes', async () => {
      projectId.value = 'osac'
      const wrapper = mountView(ManageView)
      await flushPromises()
      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(true)

      projectId.value = ''
      await flushPromises()
      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Teams')

      projectId.value = 'osac'
      await flushPromises()
      expect(wrapper.find('[data-testid="not-available-for-project"]').exists()).toBe(true)
    })

    it('ManageView sends a user without access home once the project is cleared', async () => {
      isAdmin.value = false
      projectId.value = 'osac'
      mountView(ManageView)
      await flushPromises()
      expect(navigateTo).not.toHaveBeenCalled()

      projectId.value = ''
      await flushPromises()

      expect(navigateTo).toHaveBeenCalledWith('home')
    })
  })
})
