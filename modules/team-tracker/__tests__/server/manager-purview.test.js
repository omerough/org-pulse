import { describe, it, expect } from 'vitest'

const {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerIdentity,
  projectManagerNodeKey
} = require('../../server/manager-purview')

function makeRegistry(people) {
  return { people }
}

function makeTeams(teams) {
  const teamsMap = {}
  for (const t of teams) {
    teamsMap[t.id] = t
  }
  return { teams: teamsMap }
}

describe('getManagerPurview', () => {
  it('returns both teams when manager has reports on 2 teams', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: ['team_b'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] },
      { id: 'team_b', name: 'Beta', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(2)

    const teamA = result.teams.find(t => t.id === 'team_a')
    expect(teamA.directReportUids).toEqual(['alice'])
    expect(teamA.totalMemberCount).toBe(1)

    const teamB = result.teams.find(t => t.id === 'team_b')
    expect(teamB.directReportUids).toEqual(['bob'])
    expect(teamB.totalMemberCount).toBe(1)
  })

  it('returns reports but empty teams when reports have no team assignments', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr' },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: [] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(0)
  })

  it('deduplicates team when multiple reports are on the same team', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      charlie: { uid: 'charlie', status: 'active', managerUid: 'other', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.teams[0].directReportUids).toHaveLength(2)
    // totalMemberCount includes charlie (not a direct report but on the team)
    expect(result.teams[0].totalMemberCount).toBe(3)
  })

  it('excludes inactive reports', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'inactive', managerUid: 'mgr', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(['alice'])
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(['alice'])
  })

  it('reports with no teamIds are in directReportUids but not in any team', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr' }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(['alice'])
  })

  it('handles null teamsData', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] }
    })

    const result = getManagerPurview('mgr', registry, null)

    expect(result.directReportUids).toEqual(['alice'])
    expect(result.teams).toHaveLength(0)
  })

  it('handles manager with no reports', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'other', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toHaveLength(0)
    expect(result.teams).toHaveLength(0)
  })
})

describe('buildProjectManagerModel', () => {
  const model = {
    projectId: 'flight-control',
    people: [
      { accountId: 'm', displayName: 'Mgr', email: 'm@x.io', active: true, managerRef: null, teamIds: [] },
      { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: ['t1'] },
      { accountId: 'b', displayName: 'Bob', email: 'b@x.io', active: false, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: ['t1'] },
      { accountId: 'c', displayName: 'Cara', email: 'c@x.io', active: true, managerRef: { kind: 'external', ldapUid: 'boss' }, teamIds: ['t1'] },
      { accountId: 'd', displayName: 'Dan', email: 'd@x.io', active: true, managerRef: { kind: 'roster', accountId: 'ghost' }, teamIds: ['t1'] }
    ],
    teams: [{ id: 't1', displayName: 'Team One' }]
  }

  it('maps roster managerRef to an in-roster managerUid edge', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people.a.managerUid).toBe('m')
    expect(registry.people.a.status).toBe('active')
    expect(registry.people.b.status).toBe('inactive')
  })

  it('does not fabricate edges for external or dangling roster refs', () => {
    const { registry } = buildProjectManagerModel(model)
    // external ref -> no in-roster manager edge
    expect(registry.people.c.managerUid).toBeNull()
    // roster ref pointing outside the model -> no edge
    expect(registry.people.d.managerUid).toBeNull()
  })

  it('scopes teams to the project with projectId as the org key', () => {
    const { teamsData } = buildProjectManagerModel(model)
    expect(teamsData.teams.t1).toMatchObject({ id: 't1', name: 'Team One', orgKey: 'flight-control' })
  })

  it('feeds getManagerPurview to compute reports without a second engine', () => {
    const { registry, teamsData } = buildProjectManagerModel(model)
    const purview = getManagerPurview('m', registry, teamsData)
    expect(purview.directReportUids).toEqual(['a'])
    const t1 = purview.teams.find(t => t.id === 't1')
    // Active members of t1: alice, cara, dan (bob is inactive).
    expect(t1.totalMemberCount).toBe(3)
  })

  it('excludes people with a missing or blank accountId instead of collapsing them into one entry', () => {
    const malformed = {
      projectId: 'flight-control',
      people: [
        { accountId: 'm', displayName: 'Mgr', email: 'm@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: undefined, displayName: 'Ghost One', email: 'g1@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: undefined, displayName: 'Ghost Two', email: 'g2@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: '', displayName: 'Ghost Three', email: 'g3@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: [] }
      ],
      teams: []
    }

    const { registry } = buildProjectManagerModel(malformed)

    expect(Object.keys(registry.people).sort()).toEqual(['a', 'm'])
    expect(registry.people.undefined).toBeUndefined()
  })

  it('never resolves a managerRef with a missing or blank accountId into an edge', () => {
    const malformed = {
      projectId: 'flight-control',
      people: [
        { accountId: undefined, displayName: 'Ghost Manager', email: 'ghost@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: undefined }, teamIds: [] },
        { accountId: 'b', displayName: 'Bob', email: 'b@x.io', active: true, managerRef: { kind: 'roster', accountId: '' }, teamIds: [] }
      ],
      teams: []
    }

    const { registry } = buildProjectManagerModel(malformed)

    expect(registry.people.a.managerUid).toBeNull()
    expect(registry.people.b.managerUid).toBeNull()
  })
})


function rosterPerson(accountId, overrides = {}) {
  return {
    accountId,
    displayName: accountId,
    email: `${accountId}@x.io`,
    active: true,
    ldapUid: null,
    managerRef: null,
    teamIds: [],
    ...overrides
  }
}

function auxiliary(ldapUid, managerRef = null) {
  return { ldapUid, displayName: `Aux ${ldapUid}`, title: 'Director', managerRef }
}

describe('buildProjectManagerModel auxiliary managers', () => {
  const model = {
    projectId: 'proj',
    people: [
      rosterPerson('eng', { managerRef: { kind: 'roster', accountId: 'mgr' }, teamIds: ['t1'] }),
      rosterPerson('mgr', { managerRef: { kind: 'external', ldapUid: 'dir' }, teamIds: ['t1'] }),
      rosterPerson('lost', { managerRef: { kind: 'external', ldapUid: 'nobody' } })
    ],
    teams: [{ id: 't1', displayName: 'Team One' }],
    auxiliaryManagers: {
      dir: auxiliary('dir', { kind: 'external', ldapUid: 'vp' }),
      vp: auxiliary('vp'),
      selfish: auxiliary('selfish', { kind: 'external', ldapUid: 'selfish' }),
      rostered: auxiliary('rostered', { kind: 'roster', accountId: 'mgr' })
    }
  }

  it('adds each auxiliary manager as an ldap-keyed node without an accountId or teams', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people['ldap:dir']).toMatchObject({
      uid: 'ldap:dir',
      accountId: null,
      ldapUid: 'dir',
      external: true,
      name: 'Aux dir',
      status: 'active',
      teamIds: []
    })
    expect(registry.people['ldap:vp'].external).toBe(true)
  })

  it('creates roster -> external and external -> external edges', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people.mgr.managerUid).toBe('ldap:dir')
    expect(registry.people['ldap:dir'].managerUid).toBe('ldap:vp')
    expect(registry.people['ldap:vp'].managerUid).toBeNull()
  })

  it('lets an auxiliary manager report to a roster person', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people['ldap:rostered'].managerUid).toBe('mgr')
  })

  it('creates no edge for unknown external refs or self references', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people.lost.managerUid).toBeNull()
    expect(registry.people['ldap:selfish'].managerUid).toBeNull()
  })

  it('never lets an auxiliary node overwrite a roster person with the same registry key', () => {
    const colliding = {
      projectId: 'proj',
      people: [
        rosterPerson('ldap:boss', { displayName: 'Roster Boss' }),
        rosterPerson('eng', { managerRef: { kind: 'external', ldapUid: 'boss' } })
      ],
      teams: [],
      auxiliaryManagers: { boss: auxiliary('boss') }
    }
    const { registry } = buildProjectManagerModel(colliding)
    expect(registry.people['ldap:boss'].name).toBe('Roster Boss')
    expect(registry.people.eng.managerUid).toBeNull()
  })

  it('keeps the project id as the org key for teams', () => {
    const { teamsData } = buildProjectManagerModel(model)
    expect(teamsData.teams.t1.orgKey).toBe('proj')
  })

  it('builds only roster nodes when no auxiliary managers are published', () => {
    const { registry } = buildProjectManagerModel({ ...model, auxiliaryManagers: undefined })
    expect(Object.keys(registry.people).sort()).toEqual(['eng', 'lost', 'mgr'])
    expect(registry.people.mgr.managerUid).toBeNull()
  })
})

describe('getManagerPurview with external managers', () => {
  function purviewFor(managerKey, model, options) {
    const { registry, teamsData } = buildProjectManagerModel(model)
    return getManagerPurview(managerKey, registry, teamsData, options)
  }

  const model = {
    projectId: 'proj',
    people: [
      rosterPerson('eng', { managerRef: { kind: 'roster', accountId: 'mgr' }, teamIds: ['t1'] }),
      rosterPerson('mgr', { managerRef: { kind: 'external', ldapUid: 'dir' }, teamIds: ['t1'] }),
      rosterPerson('pm', { managerRef: { kind: 'external', ldapUid: 'pmlead' }, teamIds: ['t2'] }),
      rosterPerson('solo', { managerRef: { kind: 'roster', accountId: 'rosterdir' } }),
      rosterPerson('rosterdir')
    ],
    teams: [
      { id: 't1', displayName: 'Team One' },
      { id: 't2', displayName: 'Team Two' }
    ],
    auxiliaryManagers: {
      dir: auxiliary('dir', { kind: 'external', ldapUid: 'vp' }),
      pmlead: auxiliary('pmlead', { kind: 'external', ldapUid: 'vp' }),
      vp: auxiliary('vp'),
      orphan: auxiliary('orphan', { kind: 'roster', accountId: 'rosterdir' })
    }
  }

  it('gives an external manager its roster reports and their teams', () => {
    const purview = purviewFor('ldap:dir', model)
    expect(purview.directReportUids).toEqual(['mgr'])
    expect(purview.teams.map(t => t.id)).toEqual(['t1'])
  })

  it('follows external -> external chains for indirect reports', () => {
    const purview = purviewFor('ldap:vp', model, { includeIndirect: true })
    expect(purview.directReportUids.sort()).toEqual(['ldap:dir', 'ldap:pmlead'])
    expect(purview.indirectReportUids.sort()).toEqual(['eng', 'mgr', 'pm'])
    expect(purview.teams.map(t => t.id).sort()).toEqual(['t1', 't2'])
  })

  it('counts a roster director who manages only external nodes as a manager', () => {
    const lonely = {
      projectId: 'proj',
      people: [rosterPerson('rosterdir')],
      teams: [],
      auxiliaryManagers: { orphan: auxiliary('orphan', { kind: 'roster', accountId: 'rosterdir' }) }
    }
    const purview = purviewFor('rosterdir', lonely)
    expect(purview.directReportUids).toEqual(['ldap:orphan'])
  })

  it('does not give a manager reports from an unresolved or dangling external ref', () => {
    expect(purviewFor('ldap:orphan', model).directReportUids).toEqual([])
    expect(purviewFor('ldap:nobody', model).directReportUids).toEqual([])
  })
})

describe('projectManagerNodeKey', () => {
  it('uses the accountId for roster identities and an ldap key for external ones', () => {
    expect(projectManagerNodeKey({ kind: 'roster', accountId: 'acc-1' })).toBe('acc-1')
    expect(projectManagerNodeKey({ kind: 'external', ldapUid: 'dir' })).toBe('ldap:dir')
  })
})

describe('resolveProjectManagerIdentity', () => {
  const model = {
    people: [
      rosterPerson('m', { email: 'Mgr@X.io', ldapUid: 'mgr-ipa' }),
      rosterPerson('x', { email: 'inactive@x.io', active: false, ldapUid: 'gone' }),
      rosterPerson('r', { email: 'real@x.io', ldapUid: 'rjones' })
    ],
    auxiliaryManagers: { vp: auxiliary('vp'), 'Dir.One': auxiliary('Dir.One') }
  }

  describe('email match against active roster people', () => {
    it('matches by email case-insensitively', () => {
      expect(resolveProjectManagerIdentity(model, 'mgr@x.io')).toEqual({ kind: 'roster', accountId: 'm' })
      expect(resolveProjectManagerIdentity(model, 'MGR@X.IO')).toEqual({ kind: 'roster', accountId: 'm' })
    })

    it('ignores inactive people and unknown emails', () => {
      expect(resolveProjectManagerIdentity(model, 'inactive@x.io')).toBeNull()
      expect(resolveProjectManagerIdentity(model, 'nobody@x.io')).toBeNull()
    })

    it('fails closed when the email matches more than one distinct accountId', () => {
      const ambiguous = {
        people: [
          rosterPerson('dup-1', { email: 'shared@x.io', ldapUid: 'shared' }),
          rosterPerson('dup-2', { email: 'shared@x.io' })
        ]
      }
      expect(resolveProjectManagerIdentity(ambiguous, 'shared@x.io')).toBeNull()
    })

    it('resolves when duplicate active records share the same accountId', () => {
      const sameAccount = {
        people: [
          rosterPerson('m', { email: 'same@x.io' }),
          rosterPerson('m', { email: 'same@x.io' })
        ]
      }
      expect(resolveProjectManagerIdentity(sameAccount, 'same@x.io')).toEqual({ kind: 'roster', accountId: 'm' })
    })

    it('prefers an exact email match over a colliding local-part identity', () => {
      const withCollision = {
        people: [rosterPerson('m', { email: 'vp@x.io' })],
        auxiliaryManagers: { vp: auxiliary('vp') }
      }
      expect(resolveProjectManagerIdentity(withCollision, 'vp@x.io')).toEqual({ kind: 'roster', accountId: 'm' })
    })
  })

  describe('local part against verified identities', () => {
    it('resolves a roster person by verified ldapUid when the email is not on the roster', () => {
      expect(resolveProjectManagerIdentity(model, 'rjones@redhat.com')).toEqual({ kind: 'roster', accountId: 'r' })
      expect(resolveProjectManagerIdentity(model, 'RJones@redhat.com')).toEqual({ kind: 'roster', accountId: 'r' })
    })

    it('resolves an external manager by auxiliary key, case-insensitively', () => {
      expect(resolveProjectManagerIdentity(model, 'vp@redhat.com')).toEqual({ kind: 'external', ldapUid: 'vp' })
      expect(resolveProjectManagerIdentity(model, 'dir.one@redhat.com')).toEqual({ kind: 'external', ldapUid: 'Dir.One' })
    })

    it.each(['cluster.local', 'redhat.com', 'unrelated.example'])('resolves the same identity for @%s, since the domain is not part of the claim', domain => {
      expect(resolveProjectManagerIdentity(model, `rjones@${domain}`)).toEqual({ kind: 'roster', accountId: 'r' })
      expect(resolveProjectManagerIdentity(model, `vp@${domain}`)).toEqual({ kind: 'external', ldapUid: 'vp' })
    })

    it('ignores the ldapUid of an inactive person', () => {
      expect(resolveProjectManagerIdentity(model, 'gone@redhat.com')).toBeNull()
    })

    it('fails closed when two roster people share the local part as ldapUid', () => {
      const duplicate = {
        people: [
          rosterPerson('a', { email: 'a@x.io', ldapUid: 'twin' }),
          rosterPerson('b', { email: 'b@x.io', ldapUid: 'twin' })
        ]
      }
      expect(resolveProjectManagerIdentity(duplicate, 'twin@redhat.com')).toBeNull()
    })

    it('fails closed when the local part matches both a roster ldapUid and an auxiliary key', () => {
      const collision = {
        people: [rosterPerson('a', { email: 'a@x.io', ldapUid: 'both' })],
        auxiliaryManagers: { both: auxiliary('both') }
      }
      expect(resolveProjectManagerIdentity(collision, 'both@redhat.com')).toBeNull()
    })

    it('fails closed when two auxiliary keys differ only by case', () => {
      const cased = {
        people: [],
        auxiliaryManagers: { Boss: auxiliary('Boss'), boss: auxiliary('boss') }
      }
      expect(resolveProjectManagerIdentity(cased, 'boss@redhat.com')).toBeNull()
    })

    it('has no local-part candidates when enrichment is not joined', () => {
      const unjoined = {
        people: [rosterPerson('r', { email: 'real@x.io', ldapUid: null })]
      }
      expect(resolveProjectManagerIdentity(unjoined, 'rjones@redhat.com')).toBeNull()
      expect(resolveProjectManagerIdentity(unjoined, 'vp@redhat.com')).toBeNull()
    })

    it('does not treat a roster person without an ldapUid as a local-part match', () => {
      const unverified = { people: [rosterPerson('real', { email: 'other@x.io', ldapUid: null })] }
      expect(resolveProjectManagerIdentity(unverified, 'real@redhat.com')).toBeNull()
    })
  })

  describe('malformed input', () => {
    it.each([null, undefined, '', 'no-at-sign', '@redhat.com', 'vp@', 'a@b@c.io', 42])(
      'returns null for %p',
      email => {
        expect(resolveProjectManagerIdentity(model, email)).toBeNull()
      }
    )

    it('returns null for a missing model', () => {
      expect(resolveProjectManagerIdentity(null, 'mgr@x.io')).toBeNull()
    })
  })
})
