/**
 * GET /manager/dashboard and GET /permissions/me: an unset projectId uses the
 * legacy registry path unchanged; any selected project derives purview/isManager
 * from its published roster, never from the legacy registry.
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

function makeEnrichmentEnvelope(projectId, people, { freshness = 'fresh', partial = false, auxiliaryManagers } = {}) {
  return {
    schemaVersion: 1,
    projectId,
    artifactKey: 'sources/roster-enrichment/registry.json',
    state: 'supported',
    freshness,
    partial,
    generatedAt: '2026-10-01T00:00:00Z',
    data: { projectId, people, ...(auxiliaryManagers ? { auxiliaryManagers } : {}) }
  }
}

// Flight Control: mgr-1 manages eng-1 (direct) and eng-2 (indirect, via eng-1);
// eng-3 reports to an external (non-roster) manager that is not an auxiliary node, so has no edge.
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
  for (const [projectId, enrichmentSpec] of Object.entries(enrichments)) {
    publications[projectId] = publications[projectId] || {}
    const people = Array.isArray(enrichmentSpec) ? enrichmentSpec : enrichmentSpec.people
    const freshness = Array.isArray(enrichmentSpec) ? undefined : enrichmentSpec.freshness
    const partial = Array.isArray(enrichmentSpec) ? undefined : enrichmentSpec.partial
    const auxiliaryManagers = Array.isArray(enrichmentSpec) ? undefined : enrichmentSpec.auxiliaryManagers
    publications[projectId]['sources/roster-enrichment/registry.json'] = {
      value: makeEnrichmentEnvelope(projectId, people, { freshness, partial, auxiliaryManagers })
    }
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

  it('reports hierarchy-unavailable instead of a false 403 when no enrichment is published', async () => {
    const { teams, people } = flightctlFixture()
    // No `enrichments` entry: every managerRef is null, so a real manager would
    // otherwise show zero reports and be wrongly denied as "not a manager".
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.reason).toBe('hierarchy-unavailable')
    expect(body.manager.accountId).toBe('mgr-1')
    expect(body.directReports).toEqual([])
  })

  it('reports hierarchy-unavailable instead of a false 403 when enrichment is expired', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } },
      enrichments: { flightctl: { people: enrichmentPeople, freshness: 'expired' } }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.reason).toBe('hierarchy-unavailable')
  })

  it('fails closed on an ambiguous email match instead of picking an arbitrary identity', async () => {
    const teams = [{ id: 'team-core', name: 'Core', orgKey: 'flightctl' }]
    const people = [
      { accountId: 'dup-1', displayName: 'Dup One', active: true, teamIds: ['team-core'], email: 'shared@example.com' },
      { accountId: 'dup-2', displayName: 'Dup Two', active: true, teamIds: ['team-core'], email: 'shared@example.com' }
    ]
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } }
    })
    const app = createTestServer({}, projects, { userEmail: 'shared@example.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.reason).toBe('no-registry-identity')
    expect(body.manager).toBeNull()
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

  it('leaves the legacy dashboard unchanged when projectId is unset', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true })

    const { status, body } = await requestGet(app, '/manager/dashboard')

    expect(status).toBe(200)
    expect(body.manager).toEqual({ uid: 'osacmgr', name: 'OSAC Manager', email: 'osacmgr@example.com' })
    expect(body.directReports.map(r => r.uid)).toEqual(['osacrep'])
  })

  it('serves projectId=osac from its published roster, not the legacy registry', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      rosters: { osac: { teams, people } },
      enrichments: { osac: enrichmentPeople }
    })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'mallory@example.com', isManager: true })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=osac')

    expect(status).toBe(200)
    expect(body.manager.accountId).toBe('mgr-1')
    expect(body.directReports.map(r => r.accountId)).toEqual(['eng-1'])
  })

  it('does not fall back to the legacy dashboard when the osac publication is missing', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=osac')

    expect(status).toBe(404)
    expect(body.directReports).toBeUndefined()
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

  it('reports isManager:false (not true) for a real manager when no enrichment is published', async () => {
    const { teams, people } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(false)
    expect(body.uid).toBe('mgr-1')
  })

  it('fails closed on an ambiguous email match instead of picking an arbitrary identity', async () => {
    const teams = [{ id: 'team-core', name: 'Core', orgKey: 'flightctl' }]
    const people = [
      { accountId: 'dup-1', displayName: 'Dup One', active: true, teamIds: ['team-core'], email: 'shared@example.com' },
      { accountId: 'dup-2', displayName: 'Dup Two', active: true, teamIds: ['team-core'], email: 'shared@example.com' }
    ]
    const projects = makeProjectsReader({
      knownProjectIds: ['flightctl'],
      rosters: { flightctl: { teams, people } }
    })
    const app = createTestServer({}, projects, { userEmail: 'shared@example.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.isManager).toBe(false)
    expect(body.uid).toBeNull()
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

  it('leaves the legacy permission tier unchanged when projectId is unset', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true, userRoles: ['user'] })

    const { status, body } = await requestGet(app, '/permissions/me')

    expect(status).toBe(200)
    expect(body).toEqual({ email: 'osacmgr@example.com', uid: 'osacmgr', roles: ['user'], isManager: true, managedUids: ['osacrep'] })
  })

  it('derives projectId=osac permissions from its published roster, not the legacy registry', async () => {
    const { teams, people, enrichmentPeople } = flightctlFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      rosters: { osac: { teams, people } },
      enrichments: { osac: enrichmentPeople }
    })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'mallory@example.com', isManager: true, userRoles: ['user'] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=osac')

    expect(status).toBe(200)
    expect(body).toMatchObject({ uid: 'mgr-1', ldapUid: null, isManager: true, managedUids: ['eng-1'] })
    expect(body).toHaveProperty('hierarchy')
  })

  it('does not fall back to legacy permissions when the osac publication is missing', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true, userRoles: ['user'] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=osac')

    expect(status).toBe(404)
    expect(body.managedUids).toBeUndefined()
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'] })
    const app = createTestServer({}, projects, { userEmail: 'mallory@example.com' })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })

  describe('hierarchy availability signal', () => {
    it('reports hierarchy:available for a complete manager without granting anything extra', async () => {
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
      expect(body.hierarchy).toBe('available')
    })

    it('reports hierarchy:available with isManager:false for a complete non-manager', async () => {
      const { teams, people, enrichmentPeople } = flightctlFixture()
      const projects = makeProjectsReader({
        knownProjectIds: ['flightctl'],
        rosters: { flightctl: { teams, people } },
        enrichments: { flightctl: enrichmentPeople }
      })
      const app = createTestServer({}, projects, { userEmail: 'enzo@example.com', userRoles: [] })

      const { body } = await requestGet(app, '/permissions/me?projectId=flightctl')

      expect(body.isManager).toBe(false)
      expect(body.hierarchy).toBe('available')
    })

    it('reports hierarchy:absent (isManager fail-closed) when no enrichment is published', async () => {
      const { teams, people } = flightctlFixture()
      const projects = makeProjectsReader({
        knownProjectIds: ['flightctl'],
        rosters: { flightctl: { teams, people } }
      })
      const app = createTestServer({}, projects, { userEmail: 'mallory@example.com', userRoles: [] })

      const { body } = await requestGet(app, '/permissions/me?projectId=flightctl')

      expect(body.isManager).toBe(false)
      expect(body.uid).toBe('mgr-1')
      expect(body.hierarchy).toBe('absent')
    })

    it('reports hierarchy:absent (isManager fail-closed) when enrichment is expired', async () => {
      const { teams, people, enrichmentPeople } = flightctlFixture()
      const projects = makeProjectsReader({
        knownProjectIds: ['flightctl'],
        rosters: { flightctl: { teams, people } },
        enrichments: { flightctl: { people: enrichmentPeople, freshness: 'expired' } }
      })
      const app = createTestServer({}, projects, { userEmail: 'mallory@example.com', userRoles: [] })

      const { body } = await requestGet(app, '/permissions/me?projectId=flightctl')

      expect(body.isManager).toBe(false)
      expect(body.hierarchy).toBe('absent')
    })

    it('reports hierarchy:partial (isManager fail-closed) when enrichment is a partial join with no resolvable edges', async () => {
      const teams = [{ id: 'team-core', name: 'Core', orgKey: 'flightctl' }]
      const people = [
        { accountId: 'mgr-1', displayName: 'Mallory Manager', active: true, teamIds: ['team-core'], email: 'mallory@example.com' },
        { accountId: 'eng-1', displayName: 'Erin Eng', active: true, teamIds: ['team-core'], email: 'erin@example.com' }
      ]
      // Matched records but managerRefs dropped in this incomplete republish.
      const enrichmentPeople = [
        { accountId: 'mgr-1', matchStatus: 'matched', email: 'mallory@example.com', title: 'Eng Manager' },
        { accountId: 'eng-1', matchStatus: 'matched', email: 'erin@example.com', title: 'Engineer' }
      ]
      const projects = makeProjectsReader({
        knownProjectIds: ['flightctl'],
        rosters: { flightctl: { teams, people } },
        enrichments: { flightctl: { people: enrichmentPeople, partial: true } }
      })
      const app = createTestServer({}, projects, { userEmail: 'mallory@example.com', userRoles: [] })

      const { body } = await requestGet(app, '/permissions/me?projectId=flightctl')

      expect(body.isManager).toBe(false)
      expect(body.hierarchy).toBe('partial')
    })

    it('omits the hierarchy signal entirely on the legacy (unset) path', async () => {
      const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'] })
      const app = createTestServer(makeRegistryStorageData(), projects, { userUid: 'osacmgr', userEmail: 'osacmgr@example.com', isManager: true, userRoles: ['user'] })

      const { body } = await requestGet(app, '/permissions/me')

      expect(body).not.toHaveProperty('hierarchy')
    })
  })
})

// Directors outside the roster: vp1 -> lead1 (external -> external), vp1 -> mgr-1 -> eng-1,
// lead1 -> eng-2. Enrichment is joined, so `ldapUid` is verified for matched people.
function externalHierarchyFixture() {
  const teams = [{ id: 'team-core', name: 'Core', orgKey: 'proj' }]
  const people = [
    { accountId: 'mgr-1', displayName: 'Mallory Manager', active: true, teamIds: ['team-core'], email: 'mallory@example.com' },
    { accountId: 'eng-1', displayName: 'Erin Eng', active: true, teamIds: ['team-core'], email: 'erin@example.com' },
    { accountId: 'eng-2', displayName: 'Evan Eng', active: true, teamIds: ['team-core'], email: 'evan@example.com' }
  ]
  const enrichmentPeople = [
    { accountId: 'mgr-1', matchStatus: 'matched', ldapUid: 'mallory-ipa', managerRef: { kind: 'external', ldapUid: 'vp1' } },
    { accountId: 'eng-1', matchStatus: 'matched', ldapUid: 'erin-ipa', managerRef: { kind: 'roster', accountId: 'mgr-1' } },
    { accountId: 'eng-2', matchStatus: 'matched', ldapUid: 'evan-ipa', managerRef: { kind: 'external', ldapUid: 'lead1' } }
  ]
  const auxiliaryManagers = {
    vp1: { ldapUid: 'vp1', displayName: 'Vera VP', title: 'VP', managerRef: null },
    lead1: { ldapUid: 'lead1', displayName: 'Lee Lead', title: 'Director', managerRef: { kind: 'external', ldapUid: 'vp1' } }
  }
  return { teams, people, enrichmentPeople, auxiliaryManagers }
}

function externalHierarchyProjects(overrides = {}) {
  const { teams, people, enrichmentPeople, auxiliaryManagers } = externalHierarchyFixture()
  return makeProjectsReader({
    knownProjectIds: ['proj', 'other'],
    rosters: { proj: { teams, people }, other: { teams, people } },
    enrichments: { proj: { people: enrichmentPeople, auxiliaryManagers }, ...overrides }
  })
}

describe('GET /permissions/me external manager identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves a roster manager by verified ldapUid local part', async () => {
    const app = createTestServer({}, externalHierarchyProjects(), { userEmail: 'mallory-ipa@redhat.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=proj')

    expect(status).toBe(200)
    expect(body).toMatchObject({ uid: 'mgr-1', ldapUid: null, isManager: true, managedUids: ['eng-1'], hierarchy: 'available' })
  })

  it('resolves an external manager with roster accountIds and ldap keys in managedUids', async () => {
    const app = createTestServer({}, externalHierarchyProjects(), { userEmail: 'vp1@redhat.com', userRoles: [] })

    const { status, body } = await requestGet(app, '/permissions/me?projectId=proj')

    expect(status).toBe(200)
    expect(body.uid).toBeNull()
    expect(body.ldapUid).toBe('vp1')
    expect(body.isManager).toBe(true)
    expect([...body.managedUids].sort()).toEqual(['ldap:lead1', 'mgr-1'])
  })

  it('returns a null identity on both fields for an unmatched email', async () => {
    const app = createTestServer({}, externalHierarchyProjects(), { userEmail: 'stranger@redhat.com', userRoles: [] })

    const { body } = await requestGet(app, '/permissions/me?projectId=proj')

    expect(body).toMatchObject({ uid: null, ldapUid: null, isManager: false, managedUids: [] })
  })

  it('fails closed when the local part matches both a roster ldapUid and an auxiliary key', async () => {
    const { teams, people, enrichmentPeople, auxiliaryManagers } = externalHierarchyFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['proj'],
      rosters: { proj: { teams, people } },
      enrichments: {
        proj: {
          people: enrichmentPeople,
          auxiliaryManagers: { ...auxiliaryManagers, 'mallory-ipa': { ldapUid: 'mallory-ipa', displayName: 'Imposter', managerRef: null } }
        }
      }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory-ipa@redhat.com', userRoles: [] })

    const { body } = await requestGet(app, '/permissions/me?projectId=proj')

    expect(body).toMatchObject({ uid: null, ldapUid: null, isManager: false, managedUids: [] })
  })

  it('does not resolve an external manager when enrichment is not published', async () => {
    const { teams, people } = externalHierarchyFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['proj'],
      rosters: { proj: { teams, people } }
    })
    const app = createTestServer({}, projects, { userEmail: 'vp1@redhat.com', userRoles: [] })

    const { body } = await requestGet(app, '/permissions/me?projectId=proj')

    expect(body).toMatchObject({ uid: null, ldapUid: null, isManager: false, hierarchy: 'absent' })
  })

  it('does not carry an external identity from one project into another', async () => {
    const app = createTestServer({}, externalHierarchyProjects(), { userEmail: 'vp1@redhat.com', userRoles: [] })

    const { body } = await requestGet(app, '/permissions/me?projectId=other')

    expect(body).toMatchObject({ uid: null, ldapUid: null, isManager: false, managedUids: [] })
  })
})

describe('GET /manager/dashboard external manager identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('serves an external viewer with external and roster reports, direct and indirect', async () => {
    const app = createTestServer({}, externalHierarchyProjects(), { userEmail: 'vp1@redhat.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=proj&includeIndirect=true')

    expect(status).toBe(200)
    expect(body.manager).toEqual({ accountId: null, ldapUid: 'vp1', name: 'Vera VP' })
    expect(body.directReports.map(r => r.accountId ?? `ldap:${r.ldapUid}`).sort()).toEqual(['ldap:lead1', 'mgr-1'])
    expect(body.indirectReports.map(r => r.accountId).sort()).toEqual(['eng-1', 'eng-2'])
  })

  it('returns 403 for a resolved external manager with no reports', async () => {
    const { teams, people, enrichmentPeople } = externalHierarchyFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['proj'],
      rosters: { proj: { teams, people } },
      enrichments: {
        proj: {
          people: enrichmentPeople,
          auxiliaryManagers: { idle: { ldapUid: 'idle', displayName: 'Ida Idle', managerRef: null } }
        }
      }
    })
    const app = createTestServer({}, projects, { userEmail: 'idle@redhat.com' })

    const { status } = await requestGet(app, '/manager/dashboard?projectId=proj')

    expect(status).toBe(403)
  })

  it('reports no-registry-identity for an auxiliary key that collides with a roster ldapUid', async () => {
    const { teams, people, enrichmentPeople } = externalHierarchyFixture()
    const projects = makeProjectsReader({
      knownProjectIds: ['proj'],
      rosters: { proj: { teams, people } },
      enrichments: {
        proj: {
          people: enrichmentPeople,
          auxiliaryManagers: { 'mallory-ipa': { ldapUid: 'mallory-ipa', displayName: 'Imposter', managerRef: null } }
        }
      }
    })
    const app = createTestServer({}, projects, { userEmail: 'mallory-ipa@redhat.com' })

    const { status, body } = await requestGet(app, '/manager/dashboard?projectId=proj')

    expect(status).toBe(200)
    expect(body.reason).toBe('no-registry-identity')
    expect(body.directReports).toEqual([])
  })
})
