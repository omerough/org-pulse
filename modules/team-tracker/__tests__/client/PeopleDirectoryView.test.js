import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import PeopleDirectoryView from '../../client/views/PeopleDirectoryView.vue'

const projectId = ref('')

vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const projectLabels = { acme: 'Acme Platform', flightctl: 'Flight Control' }
vi.mock('../../client/composables/useProjectDisplayName', () => ({
  useProjectDisplayName: () => computed(() => projectLabels[projectId.value] ?? projectId.value)
}))

const mockLoadRoster = vi.fn()
const rosterData = ref(null)
const rosterError = ref(null)
const rosterPeople = ref([])
const rosterTeams = ref([])

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    rosterData,
    error: rosterError,
    loadRoster: mockLoadRoster,
    people: rosterPeople,
    teams: rosterTeams
  })
}))

const navigateTo = vi.fn()

function captureCsvExport() {
  let csv = null
  vi.spyOn(global, 'Blob').mockImplementation(function (parts) {
    csv = parts.join('')
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return () => csv
}

const mounted = []

function mountView() {
  const wrapper = mount(PeopleDirectoryView, {
    global: {
      provide: {
        moduleNav: {
          params: ref({}),
          navigateTo,
          goBack: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
  mounted.push(wrapper)
  return wrapper
}

describe('PeopleDirectoryView', () => {
  afterEach(() => {
    mounted.splice(0).forEach(w => w.unmount())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = 'flightctl'
    rosterData.value = null
    rosterError.value = null
    rosterPeople.value = []
    rosterTeams.value = []
  })

  it('renders a project-qualified (Flight Control) person by displayName and navigates by accountId', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Core')

    await wrapper.find('tbody tr').trigger('click')

    expect(navigateTo).toHaveBeenCalledWith('person-detail', { accountId: 'acc-1' })
  })

  it('surfaces published GitHub/GitLab identities and hides managerRef from the UI', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'fresh', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: { kind: 'roster', accountId: 'acc-mgr' }
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('GitHub IDs')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).not.toContain('acc-mgr')
  })

  describe('project search', () => {
    const person = (n, displayName, extra) => ({
      key: `osac::acc-${n}`, accountId: `acc-${n}`, displayName, active: true, email: null,
      teamIds: ['team-1'], title: null, geo: null, identities: {}, ldapUid: null, ...extra
    })

    async function mountProject(people) {
      projectId.value = 'osac'
      rosterData.value = { projectId: 'osac', availability: 'available', reason: null, teams: [], people: [] }
      mockLoadRoster.mockResolvedValue(rosterData.value)
      rosterTeams.value = [{ key: 'osac::team-1', displayName: 'Platform', teamId: 'team-1', members: [], description: null }]
      rosterPeople.value = people
      const wrapper = mountView()
      await flushPromises()
      return wrapper
    }

    it.each([
      ['email', 'alice@example.com'],
      ['LDAP UID', 'achen'],
      ['GitHub username', 'alice-gh'],
      ['GitLab username', 'alice-gl'],
      ['team name', 'Platform']
    ])('matches a person by %s', async (_field, term) => {
      const wrapper = await mountProject([
        person(1, 'Alice Chen', {
          email: 'alice@example.com',
          ldapUid: 'achen',
          identities: { github: { username: 'alice-gh' }, gitlab: { username: 'alice-gl' } }
        }),
        person(2, 'Bob Smith', { teamIds: [], email: 'bob@example.com', ldapUid: 'bsmith' })
      ])

      await wrapper.find('input[type="text"]').setValue(term)

      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(1)
      expect(rows[0].text()).toContain('Alice Chen')
    })
  })

  it('hides identity stats when enrichment is unpublished, to avoid showing a false zero', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('GitHub IDs')
    expect(wrapper.text()).not.toContain('GitLab IDs')
  })

  it('hides identity stats when enrichment state is absent (distrusted)', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'absent', generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('GitHub IDs')
    expect(wrapper.text()).not.toContain('GitLab IDs')
  })

  it('surfaces a stale badge for stale enrichment without claiming the data is fresh', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'stale', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Profiles: stale')
    expect(wrapper.text()).toContain('GitHub IDs')
  })

  it('includes GitHub/GitLab columns in CSV export when enrichment is published', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'fresh', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: null
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')

    const csv = getCsv()
    expect(csv.split('\n')[0]).toContain('GitHub')
    expect(csv.split('\n')[0]).toContain('GitLab')
    expect(csv).toContain('ada-gh')
  })

  it('omits GitHub/GitLab CSV columns entirely (not blank values) when enrichment is unavailable', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'absent', generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')

    const csv = getCsv()
    expect(csv.split('\n')[0]).not.toContain('GitHub')
    expect(csv.split('\n')[0]).not.toContain('GitLab')
  })

  it('displays canonical Location distinct from Geo and includes it in CSV export', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: 'EMEA',
        city: null,
        country: null,
        location: 'Cork, Ireland',
        identities: {}
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('EMEA')
    expect(wrapper.text()).toContain('Cork, Ireland')

    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')
    const csv = getCsv()
    expect(csv.split('\n')[0]).toContain('Location')
    expect(csv).toContain('Cork, Ireland')
  })

  it.each([
    ['acme', 'Acme Platform'],
    ['flightctl', 'Flight Control']
  ])('shows the %s project display name in the Project column and CSV', async (id, label) => {
    projectId.value = id
    rosterData.value = { projectId: id, availability: 'available', reason: null, teams: [], people: [] }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      { key: `${id}::acc-1`, accountId: 'acc-1', displayName: 'Ada Lovelace', active: true, email: null, teamIds: [], title: null, identities: {} }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()

    const cells = wrapper.findAll('tbody tr:first-child td').map(td => td.text())
    expect(cells).toContain(label)
    expect(cells).not.toContain(id)

    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')
    expect(getCsv().split('\n')[1]).toMatch(new RegExp(`^"${label}",`))
  })

  it('enables the Geo filter for canonical projects', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      { key: 'flightctl::acc-1', accountId: 'acc-1', displayName: 'Ada Lovelace', active: true, email: null, teamIds: [], title: null, geo: 'EMEA', identities: {} },
      { key: 'flightctl::acc-2', accountId: 'acc-2', displayName: 'Grace Hopper', active: true, email: null, teamIds: [], title: null, geo: 'AMER', identities: {} }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Geo')
    const emeaCheckbox = wrapper.findAll('input[type="checkbox"]').find(c => c.element.value === 'EMEA')
    expect(emeaCheckbox).toBeTruthy()

    await emeaCheckbox.setValue(true)
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Grace Hopper')
  })

  it('clears stale people when the project changes', async () => {
    projectId.value = 'flightctl'
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null
      }
    ]
    rosterData.value = { projectId: 'flightctl', availability: 'available', reason: null, teams: [], people: rosterPeople.value }
    mockLoadRoster.mockResolvedValue(rosterData.value)

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    rosterPeople.value = [
      {
        key: 'other-project::acc-2',
        accountId: 'acc-2',
        displayName: 'Grace Hopper',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null
      }
    ]
    rosterData.value = { projectId: 'other-project', availability: 'available', reason: null, teams: [], people: rosterPeople.value }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    projectId.value = 'other-project'
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Grace Hopper')
  })

  describe('canonical states', () => {
    const person = (id, displayName) => ({
      key: `flightctl::${id}`, accountId: id, displayName, active: true, email: null,
      teamIds: [], title: null, geo: null, identities: {}
    })

    function seed(people, roster = {}) {
      projectId.value = 'flightctl'
      rosterData.value = { projectId: 'flightctl', availability: 'available', reason: null, teams: [], people: [], ...roster }
      mockLoadRoster.mockResolvedValue(rosterData.value)
      rosterTeams.value = []
      rosterPeople.value = people
    }

    it('sorts by a clicked column and reverses on the second click', async () => {
      seed([person('a2', 'Zed'), person('a1', 'Amy')])
      const wrapper = mountView()
      await flushPromises()
      const order = () => wrapper.findAll('tbody tr').map(r => r.find('td:nth-child(2)').text())
      expect(order()).toEqual(['Amy', 'Zed'])

      const nameHeader = wrapper.findAll('th').find(th => th.text().startsWith('Name'))
      await nameHeader.trigger('click')
      expect(order()).toEqual(['Zed', 'Amy'])
    })

    it('shows the unavailable state with the publication reason', async () => {
      seed([], { availability: 'unavailable', reason: 'No publication yet' })
      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.text()).toContain('People roster unavailable')
      expect(wrapper.text()).toContain('No publication yet')
      expect(wrapper.find('tbody').exists()).toBe(false)
    })

    it('shows an identity mismatch instead of another project\'s people', async () => {
      seed([person('a1', 'Amy')])
      mockLoadRoster.mockResolvedValue({ projectId: 'other', availability: 'available' })
      const wrapper = mountView()
      await flushPromises()

      expect(wrapper.text()).toContain('Roster response project identity mismatch.')
      expect(wrapper.text()).not.toContain('Amy')
    })

    it('shows a loading spinner until the roster settles', async () => {
      seed([person('a1', 'Amy')])
      let release
      mockLoadRoster.mockReturnValue(new Promise(resolve => { release = resolve }))
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.animate-spin').exists()).toBe(true)

      release(rosterData.value)
      await flushPromises()
      expect(wrapper.find('.animate-spin').exists()).toBe(false)
      expect(wrapper.text()).toContain('Amy')
    })

    it('ignores a superseded roster response after a project switch', async () => {
      seed([person('a1', 'Amy')])
      let releaseOld
      mockLoadRoster.mockReturnValueOnce(new Promise(resolve => { releaseOld = resolve }))
      const wrapper = mountView()
      await flushPromises()

      const next = { projectId: 'other', availability: 'available', reason: null }
      rosterData.value = next
      rosterPeople.value = [{ ...person('b1', 'Bea'), key: 'other::b1' }]
      mockLoadRoster.mockResolvedValueOnce(next)
      projectId.value = 'other'
      await flushPromises()

      releaseOld({ projectId: 'flightctl', availability: 'available' })
      await flushPromises()

      expect(wrapper.text()).toContain('Bea')
      expect(wrapper.text()).not.toContain('Amy')
      expect(wrapper.text()).not.toContain('identity mismatch')
    })
  })
})
