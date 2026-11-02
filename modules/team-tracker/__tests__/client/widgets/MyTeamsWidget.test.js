import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount as vtuMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import MyTeamsWidget from '../../../client/widgets/MyTeamsWidget.vue'

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

const mockProjectId = ref('flightctl')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId,
  projectParam: id => (id ? { projectId: id } : {})
}))

const mockUser = ref({ email: 'jsmith@redhat.com' })
vi.mock('@shared/client/composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isManager: ref(false),
    isAdmin: ref(false)
  })
}))

const mockTeams = ref([])
const mockRosterLoading = ref(false)
vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    teams: mockTeams,
    loading: mockRosterLoading,
    loadRoster: vi.fn()
  })
}))

function makeTeams(orgTeams) {
  return orgTeams.flatMap(o =>
    Object.entries(o.teams).map(([teamName, team]) => ({
      key: `${o.orgKey}::${teamName}`,
      displayName: team.displayName,
      members: team.members,
      metadata: team.metadata || {}
    }))
  )
}

beforeEach(() => {
  mockUser.value = { email: 'jsmith@redhat.com' }
  mockTeams.value = []
  mockRosterLoading.value = false
  mockNavigateTo.mockClear()
  mockProjectId.value = 'flightctl'
})

afterEach(() => {
  mountedWrappers.forEach(w => w.unmount())
  mountedWrappers = []
})

describe('MyTeamsWidget', () => {
  it('mounts with size prop and renders header', async () => {
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('My Teams')
  })

  it('accepts full size prop', async () => {
    const wrapper = mount(MyTeamsWidget, { props: { size: 'full' } })
    await flushPromises()
    expect(wrapper.text()).toContain('My Teams')
  })

  it('shows loading skeleton while loading', async () => {
    mockRosterLoading.value = true
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.findAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when user has no teams', async () => {
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamB: { displayName: 'Team B', members: [{ uid: 'other', email: 'other@redhat.com', name: 'Other', customFields: {} }], metadata: {} }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('You are not assigned to any teams')
  })

  it('renders cards for teams the user belongs to', async () => {
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ uid: 'jsmith', email: 'jsmith@redhat.com', name: 'Jane Smith', customFields: {} }], metadata: {} },
        TeamB: { displayName: 'Team B', members: [{ uid: 'other', email: 'other@redhat.com', name: 'Other', customFields: {} }], metadata: {} }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Team A')
    expect(wrapper.text()).not.toContain('Team B')
  })

  it('navigates to team-detail preserving projectId when project-qualified', async () => {
    mockProjectId.value = 'flightctl'
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ uid: 'jsmith', email: 'jsmith@redhat.com', name: 'Jane Smith', customFields: {} }], metadata: {} }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    const card = wrapper.findAll('button').find(b => b.text().includes('Team A'))
    await card.trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { projectId: 'flightctl', teamKey: 'org::TeamA', from: 'sotu' })
  })

  it('navigates with the newly selected project after a project switch', async () => {
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ email: 'jsmith@redhat.com', name: 'Jane Smith' }] }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()

    mockProjectId.value = 'osac'
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text().includes('Team A')).trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { projectId: 'osac', teamKey: 'org::TeamA', from: 'sotu' })
  })

  it('does not request legacy field definitions or render legacy badges', async () => {
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ email: 'jsmith@redhat.com', name: 'Jane Smith' }], metadata: { field_comp: ['API'] } }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Team A')
    expect(wrapper.text()).not.toContain('API')
  })
})
