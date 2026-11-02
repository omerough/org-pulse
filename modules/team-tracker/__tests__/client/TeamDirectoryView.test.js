import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive, computed, nextTick } from 'vue'
import TeamDirectoryView from '../../client/views/TeamDirectoryView.vue'

const projectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const projectLabels = reactive({ acme: 'Acme Platform', flightctl: 'Flight Control' })
vi.mock('../../client/composables/useProjectDisplayName', () => ({
  useProjectDisplayName: () => computed(() => projectLabels[projectId.value] ?? projectId.value)
}))

const rosterData = ref(null)
const rosterTeams = ref([])
const rosterLoading = ref(false)
const rosterError = ref(null)
const mockLoadRoster = vi.fn()
vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    rosterData,
    teams: rosterTeams,
    loading: rosterLoading,
    error: rosterError,
    uniqueMemberCount: ref(2),
    loadRoster: mockLoadRoster
  })
}))

let currentWrapper = null

const navigateTo = vi.fn()

function mountView() {
  currentWrapper = mount(TeamDirectoryView, {
    global: {
      provide: {
        moduleNav: { params: ref({}), navigateTo, goBack: vi.fn(), updateParams: vi.fn() }
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
    rosterLoading.value = false
    rosterError.value = null
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

  it('keeps team cards mounted when the project label resolves after the first render', async () => {
    setProjectTeams('late')
    const wrapper = mountView()
    await flushPromises()
    const cardBefore = wrapper.find('h3').element.closest('.grid > div')
    expect(wrapper.find('h3 + div span').text()).toBe('late')

    projectLabels.late = 'Late Platform'
    await nextTick()

    expect(wrapper.find('h3 + div span').text()).toBe('Late Platform')
    expect(wrapper.find('h3').element.closest('.grid > div')).toBe(cardBefore)
    delete projectLabels.late
  })
})

describe('TeamDirectoryView canonical roster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterData.value = null
    rosterTeams.value = []
    rosterLoading.value = false
    rosterError.value = null
  })

  afterEach(() => {
    currentWrapper?.unmount()
    currentWrapper = null
  })

  function seed(id) {
    projectId.value = id
    rosterData.value = { projectId: id, availability: 'available', teams: [], people: [] }
    rosterTeams.value = [
      { key: `${id}::b`, displayName: 'Beta', members: [{ name: 'Grace Hopper' }], metadata: {} },
      { key: `${id}::a`, displayName: 'Alpha', members: [{ name: 'Ada' }, { name: 'Linus' }, { name: 'Ken' }], metadata: {} },
      { key: `${id}::c`, displayName: 'Gamma', members: [{ name: 'Dennis' }, { name: 'Brian' }], metadata: {} }
    ]
  }

  const names = wrapper => wrapper.findAll('h3').map(h => h.text())

  it('loads the project roster on mount and renders no legacy org controls', async () => {
    seed('acme')
    const wrapper = mountView()
    await flushPromises()

    expect(mockLoadRoster).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Supported')
    expect(wrapper.text()).not.toContain('PRD Count')
    expect(wrapper.text()).not.toContain('not assigned to any team')
  })

  it('sorts by name and by headcount, and searches teams and members', async () => {
    seed('acme')
    const wrapper = mountView()
    await flushPromises()
    expect(names(wrapper)).toEqual(['Alpha', 'Beta', 'Gamma'])

    await wrapper.find('select').setValue('headcount')
    expect(names(wrapper)).toEqual(['Alpha', 'Gamma', 'Beta'])

    await wrapper.find('input[type="text"]').setValue('hopper')
    expect(names(wrapper)).toEqual(['Beta'])

    await wrapper.find('input[type="text"]').setValue('zzz')
    expect(wrapper.text()).toContain('No Teams Found')
  })

  it('opens Team Detail by canonical team key', async () => {
    seed('acme')
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('h3').element.closest('.grid > div').querySelector('h3').click()
    expect(navigateTo).toHaveBeenCalledWith('team-detail', { teamKey: 'acme::a' })
  })

  it('shows a loading spinner while the roster loads', async () => {
    seed('acme')
    rosterLoading.value = true
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.animate-spin').exists()).toBe(true)
    expect(wrapper.find('h3').exists()).toBe(false)
  })

  it.each([
    ['a roster error', () => { rosterError.value = 'Roster load failed' }, 'Roster load failed'],
    ['an unavailable publication', () => { rosterData.value = { projectId: 'acme', availability: 'unavailable', reason: 'No publication yet' } }, 'No publication yet']
  ])('shows the unavailable state for %s', async (_name, arrange, message) => {
    seed('acme')
    arrange()
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Team roster unavailable')
    expect(wrapper.text()).toContain(message)
  })

  it('reloads the roster and resets the sort when the project changes', async () => {
    seed('acme')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('select').setValue('headcount')

    seed('flightctl')
    await flushPromises()

    expect(mockLoadRoster).toHaveBeenCalledTimes(2)
    expect(wrapper.find('select').element.value).toBe('name')
    expect(wrapper.text()).not.toContain('acme::')
  })
})
