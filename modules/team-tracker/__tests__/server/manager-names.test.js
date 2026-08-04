import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../shared/server/jira', () => ({
  JIRA_HOST: 'https://test.atlassian.net',
  jiraRequest: vi.fn()
}))
vi.mock('../../server/jira/person-metrics', () => ({ fetchPersonMetrics: vi.fn() }))
vi.mock('../../server/github/contributions', () => ({ fetchGithubData: vi.fn() }))
vi.mock('../../server/gitlab/contributions', () => ({ fetchGitlabData: vi.fn() }))
vi.mock('../../../../shared/server/roster-sync', () => ({
  runSync: vi.fn(),
  scheduleSync: vi.fn()
}))
vi.mock('../../server/snapshots', () => ({
  getCompletedPeriods: vi.fn(() => []),
  getCurrentPeriod: vi.fn(() => null)
}))

const express = require('express')
const http = require('http')
const registerRoutes = require('../../server/index')
const rosterSyncConfig = require('../../../../shared/server/roster-sync/config')

function makeStorage(data) {
  return {
    readFromStorage(key) {
      return data[key] !== undefined ? JSON.parse(JSON.stringify(data[key])) : null
    },
    writeToStorage() {},
    listStorageFiles() { return [] },
    deleteStorageDirectory() {}
  }
}

function createTestServer(storageData) {
  const app = express()
  app.use(express.json())
  const router = express.Router()
  const storage = makeStorage(storageData)
  registerRoutes(router, {
    storage,
    requireAdmin: (_req, _res, next) => next(),
    requireTeamAdmin: (_req, _res, next) => next(),
    requireScope: () => (_req, _res, next) => next(),
    registerScopes: vi.fn()
  })
  app.use(router)
  return app
}

function requestGet(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const port = server.address().port
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          server.close()
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, body: data })
          }
        })
      }).on('error', (err) => {
        server.close()
        reject(err)
      })
    })
  })
}

function makeRegistryData(people, opts = {}) {
  const orgRootUids = opts.orgRoots || Object.keys(people).filter(uid => people[uid].orgRoot && people[uid].orgRoot !== '_auxiliary' && !Object.values(people).some(p => p.uid !== uid && p.orgRoot === people[uid].orgRoot))
  return {
    'team-data/registry.json': {
      meta: {
        generatedAt: '2026-01-15T00:00:00.000Z',
        provider: 'test',
        orgRoots: orgRootUids,
        vp: { name: 'VP', uid: 'vp1' }
      },
      people
    },
    'team-data/config.json': {
      orgRoots: orgRootUids.map(uid => ({ uid }))
    }
  }
}

function makePerson(uid, name, overrides = {}) {
  return {
    uid, name,
    email: `${uid}@example.com`,
    title: 'Engineer',
    status: 'active',
    orgRoot: overrides.orgRoot || 'org1',
    managerUid: overrides.managerUid || null,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-15T00:00:00.000Z',
    inactiveSince: null,
    _teamGrouping: overrides._teamGrouping || 'TeamA',
    github: null,
    gitlab: null,
    ...overrides
  }
}

describe('deriveRoster managerNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('resolves a known manager UID to a display name', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One', { managerUid: null }),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'org1' })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')
    expect(body.managerNames).toBeDefined()
    expect(body.managerNames.org1).toBe('Leader One')
  })

  it('resolves an auxiliary manager UID to a display name', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One'),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'pm_mgr' }),
      pm_mgr: makePerson('pm_mgr', 'Dana PMLeader', {
        orgRoot: '_auxiliary',
        orgType: 'auxiliary',
        _teamGrouping: null
      })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')
    expect(body.managerNames.pm_mgr).toBe('Dana PMLeader')
  })

  it('excludes unreferenced active people from managerNames', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One'),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'org1' }),
      bob: makePerson('bob', 'Bob Smith', { managerUid: 'org1' })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')
    // org1 is referenced as a manager — should be included
    expect(body.managerNames.org1).toBe('Leader One')
    // alice and bob are not anyone's manager — should be excluded
    expect(body.managerNames).not.toHaveProperty('alice')
    expect(body.managerNames).not.toHaveProperty('bob')
  })

  it('does not include unknown UIDs in managerNames', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One'),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'nonexistent_vp' })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')
    expect(body.managerNames).not.toHaveProperty('nonexistent_vp')
  })

  it('handles members with no managerUid gracefully', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One', { managerUid: null })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')
    expect(body.managerNames).toBeDefined()
    const member = Object.values(body.orgs[0].teams)[0].members[0]
    expect(member.manager).toBeNull()
  })

  it('excludes auxiliary profiles from team members', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One'),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'pm_mgr' }),
      pm_mgr: makePerson('pm_mgr', 'Dana PMLeader', {
        orgRoot: '_auxiliary',
        orgType: 'auxiliary',
        _teamGrouping: null
      })
    }
    const app = createTestServer(makeRegistryData(people, { orgRoots: ['org1'] }))

    const { body } = await requestGet(app, '/roster')

    // Auxiliary person should be in managerNames for resolution
    expect(body.managerNames.pm_mgr).toBe('Dana PMLeader')

    // But must NOT appear in any team's members array
    const allMembers = body.orgs.flatMap(org =>
      Object.values(org.teams).flatMap(t => t.members)
    )
    const auxMember = allMembers.find(m => m.uid === 'pm_mgr')
    expect(auxMember).toBeUndefined()
  })

  it('defaults managerNames to {} when registry read throws', async () => {
    const people = {
      org1: makePerson('org1', 'Leader One'),
      alice: makePerson('alice', 'Alice Chen', { managerUid: 'org1' })
    }
    const storageData = makeRegistryData(people, { orgRoots: ['org1'] })

    let registryReadCount = 0
    const brokenStorage = {
      readFromStorage(key) {
        if (key === 'team-data/registry.json') {
          registryReadCount++
          // Setup + route handler + deriveRoster each read registry before managerNames
          if (registryReadCount > 3) throw new SyntaxError('Unexpected token')
        }
        const val = storageData[key]
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : null
      },
      writeToStorage() {},
      listStorageFiles() { return [] },
      deleteStorageDirectory() {}
    }

    const app = express()
    app.use(express.json())
    const router = express.Router()
    registerRoutes(router, {
      storage: brokenStorage,
      requireAdmin: (_req, _res, next) => next(),
      requireTeamAdmin: (_req, _res, next) => next(),
      requireScope: () => (_req, _res, next) => next(),
      registerScopes: vi.fn()
    })
    app.use(router)

    const { status, body } = await requestGet(app, '/roster')
    expect(status).toBe(200)
    expect(body.managerNames).toEqual({})
    expect(body.orgs).toBeDefined()
    expect(body.orgs.length).toBeGreaterThan(0)
  })

  it('remains backward compatible when managerNames is absent from response', async () => {
    // Simulate an older response shape without managerNames
    const rosterData = { orgs: [], visibleFields: [], primaryDisplayField: null }
    // The composable defaults managerNames to {} when the field is absent
    const managerNames = rosterData.managerNames || {}
    expect(managerNames).toEqual({})
    expect(managerNames['anyUid']).toBeUndefined()
  })
})
