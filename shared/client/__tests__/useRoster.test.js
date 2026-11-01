import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

const mocks = vi.hoisted(() => ({
  getRoster: vi.fn(),
  projectId: null
}))

vi.mock('../services/api', () => ({
  getRoster: mocks.getRoster
}))

vi.mock('../composables/useProjectId.js', () => ({
  useProjectId: () => mocks.projectId
}))

async function createRoster(projectId) {
  mocks.projectId = ref(projectId)
  return (await import('../composables/useRoster.js')).useRoster()
}

describe('useRoster project migration', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getRoster.mockReset()
  })

  it('does not retry the legacy root route when the OSAC project route is unavailable', async () => {
    const missingPublication = Object.assign(new Error('Project roster publication is unavailable'), {
      status: 404,
      data: { error: 'Project roster publication is unavailable' }
    })
    mocks.getRoster.mockRejectedValueOnce(missingPublication)
    const roster = await createRoster('osac')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledOnce()
    expect(mocks.getRoster).toHaveBeenCalledWith('osac')
    expect(roster.rosterData.value).toBeNull()
    expect(roster.error.value).toBe('Project roster publication is unavailable')
  })

  it('does not fall back for a missing Flight Control publication', async () => {
    const missingPublication = Object.assign(new Error('Project roster publication is unavailable'), {
      status: 404,
      data: { error: 'Project roster publication is unavailable' }
    })
    mocks.getRoster.mockRejectedValueOnce(missingPublication)
    const roster = await createRoster('flightctl')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledTimes(1)
    expect(mocks.getRoster).toHaveBeenCalledWith('flightctl')
    expect(roster.error.value).toBe('Project roster publication is unavailable')
  })

  it('clears the roster on project switch and ignores a late response from the previous project', async () => {
    let resolveOsac
    mocks.getRoster.mockImplementationOnce(() => new Promise(resolve => { resolveOsac = resolve }))
    const roster = await createRoster('osac')
    roster.loadRoster()

    mocks.getRoster.mockResolvedValueOnce({ projectId: 'flightctl', teams: [], people: [{ accountId: 'fc-1' }] })
    mocks.projectId.value = 'flightctl'
    expect(roster.rosterData.value).toBeNull()
    await vi.waitFor(() => expect(roster.rosterData.value?.projectId).toBe('flightctl'))

    resolveOsac({ projectId: 'osac', teams: [], people: [{ accountId: 'osac-1' }] })
    await vi.waitFor(() => expect(mocks.getRoster).toHaveBeenCalledTimes(2))
    await Promise.resolve()

    expect(roster.rosterData.value.projectId).toBe('flightctl')
    expect(roster.rosterData.value.people).toEqual([{ accountId: 'fc-1' }])
  })

  it('settles a failed fetch as one loading flip with the error already set', async () => {
    mocks.getRoster.mockRejectedValueOnce(new Error('roster down'))
    const roster = await createRoster('osac')
    const settled = []
    watch([roster.rosterData, roster.loading], () => {
      settled.push({ loading: roster.loading.value, error: roster.error.value })
    })

    roster.loadRoster()
    await vi.waitFor(() => expect(roster.loading.value).toBe(false))
    await Promise.resolve()

    expect(settled).toEqual([
      { loading: true, error: null },
      { loading: false, error: 'roster down' }
    ])
  })

  it('clears an error on project switch and ignores a late failure from the previous project', async () => {
    let rejectOsac
    mocks.getRoster.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOsac = reject }))
    const roster = await createRoster('osac')
    roster.loadRoster()

    mocks.getRoster.mockImplementationOnce(() => new Promise(() => {}))
    mocks.projectId.value = 'flightctl'
    rejectOsac(new Error('osac down'))
    await Promise.resolve()
    await Promise.resolve()

    expect(roster.error.value).toBeNull()
    expect(roster.loading.value).toBe(true)
  })

  it('drops the previous project error synchronously when the project changes', async () => {
    mocks.getRoster.mockRejectedValueOnce(new Error('osac down'))
    const roster = await createRoster('osac')
    await roster.loadRoster()
    expect(roster.error.value).toBe('osac down')

    mocks.getRoster.mockImplementationOnce(() => new Promise(() => {}))
    mocks.projectId.value = 'flightctl'

    expect(roster.error.value).toBeNull()
    expect(roster.rosterData.value).toBeNull()
    expect(roster.loading.value).toBe(true)
  })

  it('rejects a legacy-shaped roster for a selected project', async () => {
    mocks.getRoster.mockResolvedValueOnce({ orgs: [] })
    const roster = await createRoster('osac')

    await roster.loadRoster()

    expect(roster.rosterData.value).toBeNull()
    expect(roster.error.value).toBe('Roster response project identity mismatch')
  })

  it('does not fall back when the selected OSAC project is unknown', async () => {
    const unknownProject = Object.assign(new Error('Unknown project'), {
      status: 404,
      data: { error: 'Unknown project' }
    })
    mocks.getRoster.mockRejectedValueOnce(unknownProject)
    const roster = await createRoster('osac')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledTimes(1)
    expect(mocks.getRoster).toHaveBeenCalledWith('osac')
    expect(roster.error.value).toBe('Unknown project')
    expect(roster.rosterData.value).toBeNull()
  })
})

describe('useRoster shared Team/Person shape across both response contracts', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getRoster.mockReset()
  })

  it('builds the same team/member shape from the normalized project read model', async () => {
    mocks.getRoster.mockResolvedValueOnce({
      projectId: 'flightctl',
      availability: 'available',
      teams: [
        { key: 'flightctl::team-1', id: 'team-1', displayName: 'RHEM-DEV', description: 'desc', memberAccountIds: ['acct-1', 'acct-2'] }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-2', displayName: 'Bob', active: false, teamIds: ['team-1'] }
      ]
    })
    const roster = await createRoster('flightctl')
    await roster.loadRoster()

    expect(roster.isNormalizedModel.value).toBe(true)
    expect(roster.teams.value).toEqual([
      {
        key: 'flightctl::team-1',
        displayKey: null,
        displayName: 'RHEM-DEV',
        members: [{ accountId: 'acct-1', name: 'Alice', jiraDisplayName: 'Alice', email: null, title: null, geo: null, city: null, country: null, location: null, identities: {}, managerRef: null, customFields: {} }],
        teamId: 'team-1',
        metadata: {},
        description: 'desc'
      }
    ])
    expect(roster.people.value).toHaveLength(2)
    expect(roster.getPersonByAccountId('acct-2')?.displayName).toBe('Bob')
    expect(roster.getPersonByAccountId('nonexistent')).toBeNull()
  })

  it('carries forward already-published optional person fields on team members', async () => {
    mocks.getRoster.mockResolvedValueOnce({
      projectId: 'flightctl',
      availability: 'available',
      teams: [
        { key: 'flightctl::team-1', id: 'team-1', displayName: 'RHEM-DEV', description: null, memberAccountIds: ['acct-1'] }
      ],
      people: [
        {
          accountId: 'acct-1',
          displayName: 'Alice',
          active: true,
          email: 'alice@example.com',
          title: 'Engineer',
          geo: 'NA',
          city: 'Cork',
          country: 'IE',
          location: 'Cork, Ireland',
          teamIds: ['team-1'],
          identities: { github: { username: 'alice-gh', source: 'ldap' }, gitlab: null },
          managerRef: { kind: 'roster', accountId: 'acct-mgr' }
        }
      ]
    })
    const roster = await createRoster('flightctl')
    await roster.loadRoster()

    expect(roster.teams.value[0].members[0]).toMatchObject({
      email: 'alice@example.com',
      title: 'Engineer',
      geo: 'NA',
      city: 'Cork',
      country: 'IE',
      location: 'Cork, Ireland',
      identities: { github: { username: 'alice-gh', source: 'ldap' }, gitlab: null },
      managerRef: { kind: 'roster', accountId: 'acct-mgr' }
    })
  })

  it('exposes auxiliaryManagers from the project publication, defaulting to empty', async () => {
    const aux = { 'ext-mgr': { ldapUid: 'ext-mgr', displayName: 'External Manager' } }
    mocks.getRoster.mockResolvedValueOnce({
      projectId: 'flightctl',
      availability: 'available',
      teams: [],
      people: [],
      auxiliaryManagers: aux
    })
    const roster = await createRoster('flightctl')
    await roster.loadRoster()

    expect(roster.auxiliaryManagers.value).toEqual(aux)
  })

  it('defaults identities/managerRef when enrichment has not populated them', async () => {
    mocks.getRoster.mockResolvedValueOnce({
      projectId: 'flightctl',
      availability: 'available',
      teams: [
        { key: 'flightctl::team-1', id: 'team-1', displayName: 'RHEM-DEV', description: null, memberAccountIds: ['acct-1'] }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] }
      ]
    })
    const roster = await createRoster('flightctl')
    await roster.loadRoster()

    expect(roster.teams.value[0].members[0]).toMatchObject({
      identities: {},
      managerRef: null
    })
  })

  it('does not throw and yields no members when a normalized team omits memberAccountIds', async () => {
    mocks.getRoster.mockResolvedValueOnce({
      projectId: 'flightctl',
      availability: 'available',
      teams: [
        { key: 'flightctl::team-1', id: 'team-1', displayName: 'RHEM-DEV', description: null }
      ],
      people: []
    })
    const roster = await createRoster('flightctl')
    await roster.loadRoster()

    expect(roster.teams.value).toEqual([
      {
        key: 'flightctl::team-1',
        displayKey: null,
        displayName: 'RHEM-DEV',
        members: [],
        teamId: 'team-1',
        metadata: {},
        description: null
      }
    ])
  })

  it('keeps the legacy orgs-based shape when no project is selected, with no normalized-model flag', async () => {
    mocks.getRoster.mockResolvedValueOnce({
      orgs: [{
        key: 'osac',
        displayName: 'OSAC',
        teams: {
          'RHEM-DEV': { displayName: 'RHEM-DEV', members: [{ accountId: 'acct-1', name: 'Carol', jiraDisplayName: 'Carol' }], metadata: {} }
        }
      }]
    })
    const roster = await createRoster('')
    await roster.loadRoster()

    expect(roster.isNormalizedModel.value).toBe(false)
    expect(roster.teams.value).toEqual([
      { key: 'osac::RHEM-DEV', displayKey: 'OSAC::RHEM-DEV', displayName: 'RHEM-DEV', members: [{ accountId: 'acct-1', name: 'Carol', jiraDisplayName: 'Carol' }], teamId: null, metadata: {}, description: null }
    ])
    expect(roster.people.value).toEqual([])
  })
})
