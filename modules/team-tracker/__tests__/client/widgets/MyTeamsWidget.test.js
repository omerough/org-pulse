import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import MyTeamsWidget from '../../../client/widgets/MyTeamsWidget.vue'

const mockNavigateTo = vi.fn()

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    navigateTo: mockNavigateTo,
    linkTo: vi.fn()
  })
}))

const { mockProjectId } = vi.hoisted(() => ({ mockProjectId: { value: '' } }))
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

const mockUserUid = ref('jsmith')
vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({
    userUid: mockUserUid,
    loading: ref(false)
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

const mockDefinitions = ref({ personFields: [], teamFields: [] })
const mockDefsLoading = ref(false)
vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: mockDefinitions,
    loading: mockDefsLoading,
    fetchDefinitions: vi.fn()
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
  mockUserUid.value = 'jsmith'
  mockTeams.value = []
  mockRosterLoading.value = false
  mockDefinitions.value = { personFields: [], teamFields: [] }
  mockDefsLoading.value = false
  mockNavigateTo.mockClear()
  mockProjectId.value = ''
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

  it('navigates to team-detail with from=sotu on card click (legacy, no projectId)', async () => {
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
    expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { teamKey: 'org::TeamA', from: 'sotu' })
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

  it('shows Engineering Speciality from primary display field', async () => {
    mockDefinitions.value = {
      personFields: [{ id: 'field_spec', label: 'Speciality', primaryDisplay: true, deleted: false }],
      teamFields: []
    }
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ uid: 'jsmith', email: 'jsmith@redhat.com', name: 'Jane Smith', customFields: { field_spec: 'Backend Engineer' } }], metadata: {} }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Speciality')
    expect(wrapper.text()).toContain('Backend Engineer')
  })

  it('shows team components when component field is configured', async () => {
    mockDefinitions.value = {
      personFields: [],
      teamFields: [{ id: 'field_comp', label: 'Component', optionsRef: 'component', deleted: false }]
    }
    mockTeams.value = makeTeams([{
      orgKey: 'org',
      teams: {
        TeamA: { displayName: 'Team A', members: [{ uid: 'jsmith', email: 'jsmith@redhat.com', name: 'Jane', customFields: {} }], metadata: { field_comp: ['API', 'Auth'] } }
      }
    }])
    const wrapper = mount(MyTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('API')
    expect(wrapper.text()).toContain('Auth')
  })
})
