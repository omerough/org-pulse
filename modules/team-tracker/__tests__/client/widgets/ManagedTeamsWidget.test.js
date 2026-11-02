import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount as vtuMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ManagedTeamsWidget from '../../../client/widgets/ManagedTeamsWidget.vue'

// mockProjectId is shared module state, so a leftover mounted wrapper's watcher
// would keep firing in later tests — track and unmount in afterEach.
let mountedWrappers = []
function mount(...args) {
  const wrapper = vtuMount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

const mockNavigateTo = vi.fn()

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    navigateTo: mockNavigateTo,
    linkTo: vi.fn()
  })
}))

const mockIsManager = ref(false)
const mockPermissionsLoading = ref(false)
const mockHierarchyAvailable = ref(true)

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({
    isManager: mockIsManager,
    loading: mockPermissionsLoading,
    hierarchyAvailable: mockHierarchyAvailable
  })
}))

const mockManagedTeams = ref([])
const mockManagerLoading = ref(false)
const mockIncludeIndirect = ref(false)
const mockProjectId = ref('flight-control')
const mockLoadManagerDashboard = vi.fn(() => Promise.resolve())
const mockResetState = vi.fn(() => {
  mockManagedTeams.value = []
})

vi.mock('../../../client/composables/useManagerDashboard', () => ({
  useManagerDashboard: () => ({
    teams: mockManagedTeams,
    loading: mockManagerLoading,
    error: ref(null),
    includeIndirect: mockIncludeIndirect,
    projectId: mockProjectId,
    load: mockLoadManagerDashboard,
    resetState: mockResetState
  })
}))

const coreTeam = { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportCount: 1, directReportAccountIds: ['a'], totalMemberCount: 3, metadata: {} }

beforeEach(() => {
  mockManagedTeams.value = []
  mockManagerLoading.value = false
  mockIncludeIndirect.value = false
  mockProjectId.value = 'flight-control'
  mockIsManager.value = false
  mockPermissionsLoading.value = false
  mockHierarchyAvailable.value = true
  mockNavigateTo.mockClear()
  mockLoadManagerDashboard.mockClear()
  mockLoadManagerDashboard.mockImplementation(() => Promise.resolve())
  mockResetState.mockClear()
})

afterEach(() => {
  mountedWrappers.forEach(w => w.unmount())
  mountedWrappers = []
})

describe('ManagedTeamsWidget', () => {
  it('mounts with either size prop and renders the header', async () => {
    for (const size of ['full', 'half']) {
      const wrapper = mount(ManagedTeamsWidget, { props: { size } })
      await flushPromises()
      expect(wrapper.text()).toContain('Managed Teams')
    }
  })

  it('shows the non-manager message for ICs and keeps the project on the My Teams link', async () => {
    const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
    await flushPromises()
    expect(wrapper.text()).toContain('This widget is for managers')

    await wrapper.findAll('button').find(b => b.text().includes('My Teams')).trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'manager-dashboard', { projectId: 'flight-control', from: 'sotu' })
  })

  describe('manager view', () => {
    beforeEach(() => {
      mockIsManager.value = true
    })

    it('renders managed team cards using directReportCount and no component badges', async () => {
      mockManagedTeams.value = [{ ...coreTeam, directReportCount: 2, totalMemberCount: 5, metadata: { field_comp: ['API'] } }]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('Core')
      expect(wrapper.text()).toContain('2 direct reports')
      expect(wrapper.text()).toContain('5 total')
      expect(wrapper.text()).not.toContain('API')
    })

    it('falls back to directReportAccountIds length when directReportCount is absent', async () => {
      mockManagedTeams.value = [{ id: 't_core', name: 'Core', directReportAccountIds: ['a', 'b', 'c'], totalMemberCount: 5 }]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('3 direct reports')
    })

    it('shows loading skeleton while loading', async () => {
      mockManagerLoading.value = true
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.findAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('navigates using a projectId::teamId key on card click', async () => {
      mockManagedTeams.value = [coreTeam]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text().includes('Core')).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { projectId: 'flight-control', teamKey: 'flight-control::t_core', from: 'sotu' })
    })

    it('qualifies team links with the project OSAC resolves to', async () => {
      mockProjectId.value = 'osac'
      mockManagedTeams.value = [{ ...coreTeam, id: 't_ops', name: 'Ops' }]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text().includes('Ops')).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { projectId: 'osac', teamKey: 'osac::t_ops', from: 'sotu' })
    })

    it('navigates with the newly selected project after a project switch', async () => {
      mockManagedTeams.value = [coreTeam]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()

      mockProjectId.value = 'osac'
      mockManagedTeams.value = [{ ...coreTeam, id: 't_ops', name: 'Ops' }]
      await wrapper.vm.$nextTick()
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text().includes('Ops')).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { projectId: 'osac', teamKey: 'osac::t_ops', from: 'sotu' })
    })

    it('reloads against the new project when the selected project changes', async () => {
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)

      mockProjectId.value = 'other-project'
      await wrapper.vm.$nextTick()
      await flushPromises()

      expect(mockResetState).toHaveBeenCalled()
      expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(2)
    })

    it('shows error state and keeps the project on the Manager Dashboard link when the load fails', async () => {
      mockLoadManagerDashboard.mockImplementation(() => Promise.reject(new Error('boom')))
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('Unable to load managed teams')

      await wrapper.findAll('button').find(b => b.text().includes('Manager Dashboard')).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'manager-dashboard', { projectId: 'flight-control', from: 'sotu' })
    })

    it('shows empty state when no managed teams', async () => {
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('No managed teams found')
    })

    it('shows managed team cards for a verified manager even when the hierarchy is only partially available', async () => {
      mockHierarchyAvailable.value = false
      mockManagedTeams.value = [coreTeam]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Core')
      expect(wrapper.text()).not.toContain("manager hierarchy isn't published")
    })
  })

  describe('non-manager gating', () => {
    it('does not load on mount or project change', async () => {
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(mockLoadManagerDashboard).not.toHaveBeenCalled()

      mockProjectId.value = 'other-project'
      await wrapper.vm.$nextTick()
      await flushPromises()
      expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
    })

    it('shows the loading skeleton, not the non-manager message, while permission is resolving', async () => {
      mockPermissionsLoading.value = true
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('This widget is for managers')
      expect(wrapper.findAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('explains an unavailable hierarchy instead of claiming the viewer is not a manager', async () => {
      mockHierarchyAvailable.value = false
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain("manager hierarchy isn't published")
      expect(wrapper.text()).not.toContain('This widget is for managers')
      expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
    })

    it('loads once permission resolves after mounting mid-load', async () => {
      mockPermissionsLoading.value = true
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(mockLoadManagerDashboard).not.toHaveBeenCalled()

      mockIsManager.value = true
      mockPermissionsLoading.value = false
      await wrapper.vm.$nextTick()
      await flushPromises()

      expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)
    })
  })
})
