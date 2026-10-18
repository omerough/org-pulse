/**
 * GET /manager/dashboard and GET /permissions/me: OSAC falls through to the
 * legacy registry path unchanged; other projects derive purview/isManager
 * from the published project roster, never from the OSAC registry.
 */
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

function makeProjectProfile(projectId) {
  return { projectId, displayName: projectId, profileRevision: 'rev' }
}

function makeRosterEnvelope(projectId, { teams, people }) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: 'sources/roster/registry.json',
    source: { id: `${projectId}-roster`, kind: 'atlassian-teams' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-10-01T00:00:00Z',
    data: { projectId, teams, people }
  }
}

function makeEnrichmentEnvelope(projectId, people) {
  return {
    schemaVersion: 1,
    projectId,
    artifactKey: 'sources/roster-enrichment/registry.json',
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    generatedAt: '2026-10-01T00:00:00Z',
    data: { projectId, people }
  }
}

// Flight Control: mgr-1 manages eng-1 (direct) and eng-2 (indirect, via eng-1);
// eng-3 reports to an external (non-roster) manager, so has no OSAC-style edge.
function flightctlFixture() {
  const teams = [{ id: 'team-core', name: 'Core', orgKey: 'flightctl' }]
  const people = [
    { accountId: 'mgr-1', displayName: 'Mallory Manager', active: true, teamIds: ['team-core'], email: 'mallory@example.com' },
    { accountId: 'eng-1', displayName: 'Erin Eng', active: true, teamIds: ['team-core'], email: 'erin@example.com' },
    { accountId: 'eng-2', displayName: 'Evan Eng', active: true, teamIds: ['team-core'], email: 'evan@example.com' },
    { accountId: 'eng-3', displayName: 'Enzo Eng', active: true, teamIds: ['team-core'], email: 'enzo@example.com' }
  ]
  const enrichmentPeople = [
    { accountId: 'mgr-1', matchStatus: 'matched', email: 'mallory@example.com', title: 'Eng Manager' },
    { accountId: 'eng-1', matchStatus: 'matched', email: 'erin@example.com', title: 'Engineer', managerRef: { kind: 'roster', accountId: 'mgr-1' } },
    { accountId: 'eng-2', matchStatus: 'matched', email: 'evan@example.com', title: 'Engineer', managerRef: { kind: 'roster', accountId: 'eng-1' } },
    { accountId: 'eng-3', matchStatus: 'matched', email: 'enzo@example.com', title: 'Engineer', managerRef: { kind: 'external', ldapUid: 'ext-mgr' } }
  ]
  return { teams, people, enrichmentPeople }
}

function makeProjectsReader({ knownProjectIds = [], rosters = {}, enrichments = {} } = {}) {
  const profiles = {}
  for (const id of knownProjectIds) profiles[id] = makeProjectProfile(id)

  const publications = {}
  for (const [projectId, fixture] of Object.entries(rosters)) {
    publications[projectId] = publications[projectId] || {}
    publications[projectId]['sources/roster/registry.json'] = { value: makeRosterEnvelope(projectId, fixture) }
  }
  for (const [projectId, enrichmentPeople] of Object.entries(enrichments)) {
    publications[projectId] = publications[projectId] || {}
    publications[projectId]['sources/roster-enrichment/registry.json'] = { value: makeEnrichmentEnvelope(projectId, enrichmentPeople) }
  }

  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeRegistryStorageData() {
  return {
    'team-data/registry.json': {
      meta: { generatedAt: '2026-01-01', provider: 'test', orgRoots: ['org1'] },
      people: {
        osacmgr: {
          uid: 'osacmgr', name: 'OSAC Manager', email: 'osacmgr@example.com',
          title: 'Manager', status: 'active', managerUid: null, orgRoot: 'org1', teamIds: []
        },
        osacrep: {
          uid: 'osacrep', name: 'OSAC Report', email: 'osacrep@example.com',
          title: 'Engineer', status: 'active', managerUid: 'osacmgr', orgRoot: 'org1', teamIds: []
        }
      }
    },
    'team-data/config.json': { orgRoots: [{ uid: 'org1' }], teamDataSource: 'in-app' }
  }
}

function createTestServer(storageData, projects, reqContext = {}) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { Object.assign(req, reqContext); next() })
  const router = express.Router()
  registerRoutes(router, {
    storage: makeStorage(storageData),
    projects,
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

describe('GET /manager/dashboard project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('returns direct and indirect reports for a verified Flight Control manager', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl&includeIndirect=true')

    expect(status).toBe(200)
    expect(body.manager.accountId).toBe('mgr-1')
    expect(body.directReports.map(r => r.accountId)).toEqual(['eng-1'])
    expect(body.indirectReports.map(r => r.accountId)).toEqual(['eng-2'])
    expect(body.fieldDefinitions).toEqual({ person: [], team: [] })
  })

  it('does not fabricate a report edge from an external manager ref', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(body.directReports.map(r => r.accountId)).not.toContain('eng-3')
  })

  it('returns 403 for a non-manager Flight Control identity', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'enzo@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(403)
    expect(body.error).toBe('You are not a manager')
  })

  it('reports no-registry-identity when the email matches no active Flight Control person', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'nobody@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.reason).toBe('no-registry-identity')
    expect(body.directReports).toEqual([])
  })

  it('does not let an OSAC manager identity leak into Flight Control purview', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    // Same email as the OSAC manager fixture, but it has no Flight Control record.
    const app = createTestServer(makeRegistryStorageData(), projects, { userEmail: 'osacmgr@example.com', userUid: 'osacmgr', isManager: true })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.reason).toBe('no-registry-identity')
  })

  it('leaves the OSAC dashboard byte-for-byte unchanged when projectId is osac or unset', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true })

    const unset = await requestGet(app, '/manager/dashboard')
    const osac = await requestGet(app, '/manager/dashboard?projectId=osac')

    expect(unset.status).toBe(200)
    expect(osac.status).toBe(200)
    expect(unset.body.manager).toEqual({ uid: 'osacmgr', name: 'OSAC Manager', email: 'osacmgr@example.com' })
    expect(osac.body).toEqual(unset.body)
    expect(osac.body.directReports.map(r => r.uid)).toEqual(['osacrep'])
  })
})

describe('GET /permissions/me project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports isManager:true with a canonical accountId for a verified Flight Control manager', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(true)
    expect(body.uid).toBe('mgr-1')
    expect(body.managedUids).toEqual(['eng-1'])
  })

  it('reports isManager:false for a non-manager Flight Control identity', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'enzo@example.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(false)
    expect(body.uid).toBe('eng-3')
  })

  it('reports isManager:false and uid:null for an unresolved identity', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer({}, projects, { userEmail: 'nobody@example.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(false)
    expect(body.uid).toBeNull()
  })

  it('does not let an OSAC manager identity leak into Flight Control isManager', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: enrichmentPeople }
    })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true, userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(false)
    expect(body.uid).toBeNull()
  })

  it('leaves the OSAC permission tier byte-for-byte unchanged when projectId is osac or unset', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true, userRoles: ['user'] })

    const unset = await requestGet(app, '/permissions/me')
    const osac = await requestGet(app, '/permissions/me?projectId=osac')

    expect(unset.status).toBe(200)
    expect(unset.body).toEqual({ email: 'osacmgr@example.com', uid: 'osacmgr', roles: ['user'], isManager: true, managedUids: ['osacrep'] })
    expect(osac.body).toEqual(unset.body)
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'] })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })
})
