import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import TeamDirectoryView from '../../client/views/TeamDirectoryView.vue'

const projectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const projectLabels = { acme: 'Acme Platform', flightctl: 'Flight Control' }
vi.mock('../../client/composables/useProjectDisplayName', () => ({
  useProjectDisplayName: () => computed(() => projectLabels[projectId.value] ?? projectId.value)
}))

const rosterData = ref(null)
const rosterTeams = ref([])
const mockLoadRoster = vi.fn()
vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    rosterData,
    teams: rosterTeams,
    loading: ref(false),
    error: ref(null),
    uniqueMemberCount: ref(2),
    loadRoster: mockLoadRoster
  })
}))

vi.mock('../../client/composables/useOrgRoster', () => ({
  useOrgRoster: () => ({
    orgs: ref([]),
    selectedOrg: ref(null),
    loading: ref(false),
    searchQuery: ref(''),
    sortBy: ref('name'),
    filteredTeams: ref([{ name: 'Legacy Team', org: 'Legacy Org', memberCount: 1, members: [], metadata: {} }]),
    totalPeople: ref(1),
    unassigned: ref([]),
    loadTeams: vi.fn(),
    loadOrgs: vi.fn()
  })
}))

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: ref(false) })
}))

vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: ref({ teamFields: [] }),
    fetchDefinitions: vi.fn().mockResolvedValue({})
  })
}))

let currentWrapper = null

function mountView() {
  currentWrapper = mount(TeamDirectoryView, {
    global: {
      provide: {
        moduleNav: { params: ref({}), navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn() }
      }
    }
  })
  return currentWrapper
}

function setProjectTeams(id) {
  projectId.value = id
  rosterData.value = { projectId: id, availability: 'available', teams: [], people: [] }
  rosterTeams.value = [
    { key: `${id}::team-1`, displayName: 'Core', members: [{ name: 'Ada Lovelace' }], metadata: {} }
  ]
}

describe('TeamDirectoryView project labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = ''
    rosterData.value = null
    rosterTeams.value = []
  })

  afterEach(() => {
    currentWrapper?.unmount()
    currentWrapper = null
  })

  it.each([
    ['acme', 'Acme Platform'],
    ['flightctl', 'Flight Control'],
    ['unregistered', 'unregistered']
  ])('shows %s teams under the label "%s"', async (id, label) => {
    setProjectTeams(id)

    const wrapper = mountView()
    await flushPromises()

    const subtitle = wrapper.find('h3 + div span')
    expect(wrapper.find('h3').text()).toBe('Core')
    expect(subtitle.text()).toBe(label)
  })

  it('keeps the legacy org label without a project', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Legacy Org')
    expect(mockLoadRoster).not.toHaveBeenCalled()
  })
})
