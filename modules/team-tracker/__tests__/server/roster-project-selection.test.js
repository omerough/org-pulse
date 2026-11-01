/**
 * GET /roster: any selected project uses its publication; an unset projectId uses the enriched legacy roster.
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
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function makeProjectRosterEnvelope(projectId) {
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
    generatedAt: '2026-09-28T00:00:00Z',
    data: {
      projectId,
      teams: [{ id: 'team-1', name: 'RHEM-DEV', orgKey: projectId }],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] }
      ]
    }
  }
}

function makeProjectsReader({ knownProjectIds = [], publishedProjectIds = [] } = {}) {
  const profiles = {}
  for (const id of knownProjectIds) profiles[id] = makeProjectProfile(id)

  const publications = {}
  for (const id of publishedProjectIds) {
    publications[id] = { 'sources/roster/registry.json': { value: makeProjectRosterEnvelope(id) } }
  }

  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeRegistryStorageData() {
  return {
    'team-data/registry.json': {
      meta: {
        generatedAt: '2026-01-15T00:00:00.000Z',
        provider: 'atlassian-teams',
        orgRoots: ['uid_lead'],
        vp: null
      },
      people: {
        uid_lead: {
          uid: 'uid_lead', name: 'Lead Person', status: 'active', orgRoot: 'uid_lead',
          email: 'lead@example.com', title: 'Engineering Manager', managerUid: null,
          geo: 'NA', location: 'Boston', miroTeam: 'Core'
        },
        uid_member: {
          uid: 'uid_member', name: 'Enriched Person', status: 'active', orgRoot: 'uid_lead',
          email: 'member@example.com', title: 'Senior Engineer', managerUid: 'uid_lead',
          geo: 'EMEA', location: 'Dublin', miroTeam: 'Core'
        }
      }
    },
    'team-data/config.json': {
      orgRoots: [{ uid: 'uid_lead' }]
    }
  }
}

function createTestServer(storageData, projects) {
  const app = express()
  app.use(express.json())
  const router = express.Router()
  const storage = makeStorage(storageData)
  registerRoutes(router, {
    storage,
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

describe('GET /roster project-selection dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterSyncConfig.clearDisplayNamesCache()
  })

  it('routes projectId=osac through its project publication, not the legacy roster', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['osac', 'flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=osac')

    expect(status).toBe(200)
    expect(body.projectId).toBe('osac')
    expect(body.availability).toBe('available')
    expect(body.orgs).toBeUndefined()
    expect(body.people.map(p => p.key)).toEqual(['osac::acct-1'])
  })

  it('does not fall back to the legacy roster when the osac publication is missing', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=osac')

    expect(status).toBe(404)
    expect(body.error).toBe('Project roster publication is unavailable')
    expect(body.orgs).toBeUndefined()
  })

  it('returns the editable legacy payload when no projectId is given and in-app teams are enabled', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['osac', 'flightctl']
    })
    const data = makeRegistryStorageData()
    data['team-data/config.json'].teamDataSource = 'in-app'
    const app = createTestServer(data, projects)

    const { status, body } = await requestGet(app, '/roster')

    expect(status).toBe(200)
    expect(body.teamDataSource).toBe('in-app')
    expect(body.permissions).toMatchObject({ roles: [], isManager: false })
    expect(body.projectId).toBeUndefined()
  })

  it('routes projectId=flightctl through the normalized project read model, unaffected by osac', async () => {
    const projects = makeProjectsReader({
      knownProjectIds: ['osac', 'flightctl'],
      publishedProjectIds: ['flightctl']
    })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=flightctl')

    expect(status).toBe(200)
    expect(body.projectId).toBe('flightctl')
    expect(body.availability).toBe('available')
    expect(body.teams).toEqual([
      { key: 'flightctl::team-1', projectId: 'flightctl', id: 'team-1', displayName: 'RHEM-DEV', description: null, state: null, teamType: null, memberAccountIds: ['acct-1'] }
    ])
    expect(body.people).toEqual([
      { key: 'flightctl::acct-1', projectId: 'flightctl', accountId: 'acct-1', displayName: 'Alice', active: true, email: null, teamIds: ['team-1'], title: null, manager: null, managerRef: null, geo: null, city: null, country: null, location: null, identities: {}, ldapUid: null }
    ])
  })

  it('returns 404 for an unknown project', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=nonexistent')

    expect(status).toBe(404)
    expect(body.error).toBe('Unknown project')
  })

  it('returns 400 for a malformed projectId', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster?projectId=Not_Valid!')

    expect(status).toBe(400)
    expect(body.error).toMatch(/lowercase kebab-case/)
  })

  it('falls through to the legacy roster when no projectId is given', async () => {
    const projects = makeProjectsReader({ knownProjectIds: ['osac', 'flightctl'], publishedProjectIds: ['flightctl'] })
    const app = createTestServer(makeRegistryStorageData(), projects)

    const { status, body } = await requestGet(app, '/roster')

    expect(status).toBe(200)
    expect(body.teamDataSource).not.toBe('project-publication')
    expect(body.orgs[0].key).toBe('uid_lead')
  })
})
