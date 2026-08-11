import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerExecutionRoutes = require('../../../server/execution/routes')
const { _setFetchFn } = require('../../../server/execution/scheduler')

const mockFetchArtifacts = vi.fn()

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      return store[key] ? JSON.parse(JSON.stringify(store[key])) : null
    },
    writeToStorage(key, value) {
      store[key] = value
    },
    listStorageFiles(prefix) {
      return Object.keys(store)
        .filter(k => k.startsWith(prefix + '/'))
        .map(k => k.slice(prefix.length + 1))
    }
  }
}

function makeRouter() {
  const routes = { get: {}, post: {}, delete: {} }
  return {
    get: vi.fn(function (path, ...handlers) {
      routes.get[path] = handlers
    }),
    post: vi.fn(function (path, ...handlers) {
      routes.post[path] = handlers
    }),
    delete: vi.fn(function (path, ...handlers) {
      routes.delete[path] = handlers
    }),
    _routes: routes
  }
}

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { res._status = code; return res },
    json(data) { res._json = data; return res }
  }
  return res
}

describe('execution routes', () => {
  let router, requireAdmin, context, storage

  beforeEach(() => {
    vi.clearAllMocks()
    _setFetchFn(mockFetchArtifacts)


    storage = makeStorage()
    router = makeRouter()
    requireAdmin = vi.fn()
    context = {
      storage,
      requireAdmin,
      requireScope: () => (req, res, next) => next(),
      registerDiagnostics: vi.fn(),
      secrets: {}
    }
    registerExecutionRoutes(router, context)
  })

  describe('route registration', () => {
    it('registers all expected GET routes', () => {
      const paths = Object.keys(router._routes.get)
      expect(paths).toContain('/features')
      expect(paths).toContain('/features/:key')
      expect(paths).toContain('/status')
      expect(paths).toContain('/versions')
      expect(paths).toContain('/epics')
      expect(paths).toContain('/config')
    })

    it('registers all expected POST routes', () => {
      const paths = Object.keys(router._routes.post)
      expect(paths).toContain('/refresh')
      expect(paths).toContain('/config')
    })
  })

  describe('requireAdmin middleware', () => {
    it('gates POST /refresh behind requireAdmin', () => {
      expect(router.post).toHaveBeenCalledWith('/refresh', requireAdmin, expect.any(Function), expect.any(Function))
    })

    it('gates GET /config behind requireAdmin', () => {
      expect(router.get).toHaveBeenCalledWith('/config', requireAdmin, expect.any(Function), expect.any(Function))
    })

    it('gates POST /config behind requireAdmin', () => {
      expect(router.post).toHaveBeenCalledWith('/config', requireAdmin, expect.any(Function), expect.any(Function))
    })
  })

  describe('GET /status', () => {
    it('returns expected shape when no data', () => {
      const handler = router._routes.get['/status'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json).toMatchObject({
        dataAvailable: false,
        fetchedAt: null,
        schemaVersion: null,
        featureCount: 0,
        configured: false,
        tokenSource: null
      })
      expect(res._json.dataSource).toMatch(/gitlab-ci/)
    })

    it('includes lastFetch when present', () => {
      const storageWithData = makeStorage({
        'releases/execution/last-fetch.json': { status: 'success', timestamp: '2026-04-08T06:00:00Z' }
      })
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageWithData, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.get['/status'].at(-1)
      const res = makeRes()
      handler({}, res)

      expect(res._json.lastFetch).toBeDefined()
      expect(res._json.lastFetch.status).toBe('success')
    })
  })

  describe('POST /refresh', () => {
    it('returns 429 on cooldown', async () => {
      const { init } = require('../../../server/execution/scheduler')
      init({ GITLAB_TOKEN: 'token' })
      mockFetchArtifacts.mockResolvedValue({ status: 'success', timestamp: new Date().toISOString() })

      const storageWithConfig = makeStorage({
        'releases/execution/config.json': { enabled: true }
      })
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageWithConfig, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn(), secrets: { GITLAB_TOKEN: 'token' } })

      const handler = r._routes.post['/refresh'].at(-1)

      // First refresh succeeds
      const res1 = makeRes()
      await handler({}, res1)
      expect(res1._json.status).toBe('success')

      // Second refresh hits cooldown
      const res2 = makeRes()
      await handler({}, res2)
      expect(res2._status).toBe(429)
      expect(res2._json.status).toBe('cooldown')
      expect(res2._json.retryAfter).toBeGreaterThan(0)

  
    })
  })

  describe('POST /config', () => {
    it('saves and loads config round-trip', async () => {
      process.env.GITLAB_TOKEN = 'token'

      const storageForConfig = makeStorage()
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: storageForConfig, requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const postHandler = r._routes.post['/config'].at(-1)
      const res1 = makeRes()
      await postHandler({
        body: {
          gitlabBaseUrl: 'https://custom.gitlab.com',
          projectPath: 'my/project',
          branch: 'develop',
          jobName: 'build',
          artifactPath: 'dist',
          refreshIntervalHours: 6,
          enabled: false
        }
      }, res1)
      expect(res1._json.status).toBe('saved')

      // Load it back
      const getHandler = r._routes.get['/config'].at(-1)
      const res2 = makeRes()
      getHandler({}, res2)
      expect(res2._json.gitlabBaseUrl).toBe('https://custom.gitlab.com')
      expect(res2._json.projectPath).toBe('my/project')
      expect(res2._json.branch).toBe('develop')
      expect(res2._json.refreshIntervalHours).toBe(6)

  
    })

    it('rejects http:// in gitlabBaseUrl', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({
        body: { gitlabBaseUrl: 'http://internal-service.svc.cluster.local' }
      }, res)

      expect(res._status).toBe(400)
      expect(res._json.message).toContain('https://')

  
    })

    it('rejects invalid refreshIntervalHours', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)

      const res1 = makeRes()
      await handler({ body: { refreshIntervalHours: 0 } }, res1)
      expect(res1._status).toBe(400)

      const res2 = makeRes()
      await handler({ body: { refreshIntervalHours: 999 } }, res2)
      expect(res2._status).toBe(400)

      const res3 = makeRes()
      await handler({ body: { refreshIntervalHours: 'abc' } }, res3)
      expect(res3._status).toBe(400)

  
    })

    it('rejects non-string fields', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({ body: { projectPath: 123 } }, res)
      expect(res._status).toBe(400)
      expect(res._json.message).toContain('projectPath')

  
    })

    it('rejects non-boolean enabled', async () => {
      const r = makeRouter()
      registerExecutionRoutes(r, { storage: makeStorage(), requireAdmin: vi.fn(), requireScope: () => (req, res, next) => next(), registerDiagnostics: vi.fn() })

      const handler = r._routes.post['/config'].at(-1)
      const res = makeRes()
      await handler({ body: { enabled: 'yes' } }, res)
      expect(res._status).toBe(400)
      expect(res._json.message).toContain('enabled')

  
    })
  })

  describe('diagnostics', () => {
    it('registers diagnostics hook', () => {
      expect(context.registerDiagnostics).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('GET /epics', () => {
    function setupData() {
      storage = makeStorage({
        'releases/execution/index.json': {
          fetchedAt: '2026-08-01T00:00:00Z',
          features: [
            { key: 'OSAC-100', summary: 'Feature A', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.4'] },
            { key: 'OSAC-200', summary: 'Feature B', status: 'To Do', statusCategory: 'To Do', fixVersions: ['0.5'] }
          ]
        },
        'releases/execution/features/OSAC-100.json': {
          key: 'OSAC-100',
          epics: [
            {
              key: 'OSAC-101', summary: 'Epic 1', fixVersions: ['0.4'], fixVersionSource: 'direct',
              components: ['Comp A'], componentSource: 'direct', parentFeatureKey: 'OSAC-100',
              blockerCount: 1, issueCount: 5, pct: 40, progress: 40
            },
            {
              key: 'OSAC-102', summary: 'Epic 2', fixVersions: [], fixVersionSource: 'unknown',
              components: [], componentSource: 'unknown', parentFeatureKey: 'OSAC-100',
              blockerCount: 0, issueCount: 2, pct: 0, progress: 0
            }
          ]
        },
        'releases/execution/features/OSAC-200.json': {
          key: 'OSAC-200',
          epics: [
            {
              key: 'OSAC-201', summary: 'Epic 3', fixVersions: ['0.9'], fixVersionSource: 'via-parent-feature',
              components: ['Comp B'], componentSource: 'via-parent-feature', parentFeatureKey: 'OSAC-200',
              blockerCount: 0, issueCount: 1, pct: 100, progress: 100
            }
          ]
        }
      })
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)
    }

    it('requires a version query parameter', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: {} }, res)

      expect(res._status).toBe(400)
    })

    it('returns only Features whose Fix Version matches, each with its full epics array', () => {
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json.featureCount).toBe(1)
      expect(res._json.features[0].key).toBe('OSAC-100')
      expect(res._json.features[0].epics).toHaveLength(2)
      expect(res._json.features[0].epics[0].fixVersionSource).toBe('direct')
      expect(res._json.features[0].epics[1].fixVersionSource).toBe('unknown')
    })

    it('includes an epic under its parent Feature even when the epic names a different Fix Version', () => {
      // OSAC-200's own fixVersions is 0.5, but its epic OSAC-201 names 0.9 — the tree is
      // built by Feature membership, so the epic must still appear, with its real value visible.
      setupData()
      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.5' } }, res)

      expect(res._json.features[0].key).toBe('OSAC-200')
      expect(res._json.features[0].epics[0].fixVersions).toEqual(['0.9'])
    })

    it('returns empty result when no index data is available', () => {
      storage = makeStorage()
      router = makeRouter()
      context = { ...context, storage }
      registerExecutionRoutes(router, context)

      const handler = router._routes.get['/epics'].at(-1)
      const res = makeRes()
      handler({ query: { version: '0.4' } }, res)

      expect(res._json).toEqual({ version: '0.4', fetchedAt: null, featureCount: 0, features: [] })
    })
  })
})
