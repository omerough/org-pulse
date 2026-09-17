import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerOsacRoutes = require('../../server/osac')

function makeStorage(data = {}) {
  const store = { ...data }
  return {
    readFromStorage(key) {
      return store[key] ? JSON.parse(JSON.stringify(store[key])) : null
    }
  }
}

function makeRouter() {
  const routes = { get: {} }
  return {
    get: vi.fn(function(path, ...handlers) {
      routes.get[path] = handlers
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

describe('product-builds/osac routes', () => {
  let router, storage

  beforeEach(() => {
    vi.clearAllMocks()
    storage = makeStorage()
    router = makeRouter()
  })

  it('returns stored build data', () => {
    const data = {
      schemaVersion: 1,
      lastFetchedAt: '2026-09-16T04:12:33Z',
      builds: [{ runId: 1, mode: 'nightly', version: '0.0.10-nightly.1', publishedAt: '2026-09-16T03:41:07Z', charts: [], images: [], e2eSkipped: false, runUrl: 'https://example.com' }]
    }
    storage = makeStorage({ 'osac-builds-data.json': data })
    registerOsacRoutes(router, { storage })

    const res = makeRes()
    router._routes.get['/osac/builds'][0]({}, res)

    expect(res._json).toEqual(data)
  })

  it('returns an empty shape when no data has been stored yet', () => {
    registerOsacRoutes(router, { storage })

    const res = makeRes()
    router._routes.get['/osac/builds'][0]({}, res)

    expect(res._json).toEqual({ schemaVersion: 1, lastFetchedAt: null, builds: [] })
  })
})
