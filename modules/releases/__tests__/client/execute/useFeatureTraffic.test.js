import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeatureDetail, useFeatureTraffic, useVersions, useEpicsByRelease } from '../../../client/execute/composables/useFeatureTraffic'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useFeatureDetail', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    window.location.hash = '#/releases/execute?projectId=osac'
    window.dispatchEvent(new Event('urlchange'))
  })

  it('loads a feature and caches the successful response', async () => {
    mockApiRequest.mockResolvedValue({ key: 'A-1', epics: [] })
    const { feature, loading, error, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')

    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(mockApiRequest).toHaveBeenCalledTimes(1)
    expect(mockApiRequest).toHaveBeenCalledWith('/modules/releases/execution/features/A-1?projectId=osac')
  })

  it('reselecting a cached key returns cached data without a new request', async () => {
    mockApiRequest.mockResolvedValue({ key: 'A-1', epics: [] })
    const { feature, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')
    await loadFeature('A-1')

    expect(mockApiRequest).toHaveBeenCalledTimes(1)
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
  })

  it('clears feature to null while an uncached fetch is in flight', () => {
    const d = deferred()
    mockApiRequest.mockReturnValue(d.promise)
    const { feature, loading, loadFeature } = useFeatureDetail()

    feature.value = { key: 'STALE', epics: [] }
    loadFeature('A-1')

    expect(feature.value).toBeNull()
    expect(loading.value).toBe(true)
  })

  it('a late response for an abandoned selection never overwrites the currently selected feature', async () => {
    const dA = deferred()
    const dB = deferred()
    mockApiRequest.mockImplementation((url) => (url.includes('A-1') ? dA.promise : dB.promise))
    const { feature, loadFeature } = useFeatureDetail()

    const pA = loadFeature('A-1')
    const pB = loadFeature('B-1')

    dB.resolve({ key: 'B-1', epics: [] })
    await pB

    dA.resolve({ key: 'A-1', epics: [] })
    await pA

    expect(feature.value).toEqual({ key: 'B-1', epics: [] })
  })

  it('a cached reselection while another request is pending is not later overwritten by that pending response', async () => {
    mockApiRequest.mockResolvedValueOnce({ key: 'A-1', epics: [] })
    const { feature, loadFeature } = useFeatureDetail()
    await loadFeature('A-1')

    const dB = deferred()
    mockApiRequest.mockReturnValueOnce(dB.promise)
    const pB = loadFeature('B-1')
    expect(feature.value).toBeNull() // B-1 fetch in flight, not yet cached

    await loadFeature('A-1') // cache hit, synchronous
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })

    dB.resolve({ key: 'B-1', epics: [] })
    await pB

    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
  })

  it('a failed load does not poison the cache, so retrying the same key issues a fresh request', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('boom'))
    const { feature, error, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')
    expect(error.value).toBe('boom')
    expect(feature.value).toBeNull()

    mockApiRequest.mockResolvedValueOnce({ key: 'A-1', epics: [] })
    await loadFeature('A-1')

    expect(error.value).toBeNull()
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
    expect(mockApiRequest).toHaveBeenCalledTimes(2)
  })

  it('a late error for an abandoned selection never overwrites a since-succeeded selection', async () => {
    const dA = deferred()
    mockApiRequest.mockImplementation((url) => (url.includes('A-1') ? dA.promise : Promise.resolve({ key: 'B-1', epics: [] })))
    const { feature, error, loadFeature } = useFeatureDetail()

    const pA = loadFeature('A-1')
    await loadFeature('B-1')
    expect(feature.value).toEqual({ key: 'B-1', epics: [] })

    dA.reject(new Error('too late'))
    await pA.catch(() => {})

    expect(feature.value).toEqual({ key: 'B-1', epics: [] })
    expect(error.value).toBeNull()
  })

  it('drops a version response that arrives after the project changed', async () => {
    const osacResponse = deferred()
    mockApiRequest.mockImplementation(url => (url.includes('projectId=osac')
      ? osacResponse.promise
      : Promise.resolve({ versions: ['2.0'], state: 'supported' })))
    const { versions, state, loadVersions } = useVersions()

    const pending = loadVersions('epics')
    window.location.hash = '#/releases/execute?projectId=flightctl'
    window.dispatchEvent(new Event('urlchange'))
    await loadVersions('epics')
    expect(versions.value).toEqual(['2.0'])

    osacResponse.resolve({ versions: ['1.0'], state: 'supported' })
    await pending

    expect(versions.value).toEqual(['2.0'])
    expect(state.value).toBe('supported')
  })

  it('drops an older version response that resolves after a newer request for the same project', async () => {
    const first = deferred()
    mockApiRequest.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ versions: ['new'], state: 'supported' })
    const { versions, loadVersions } = useVersions()

    const older = loadVersions('epics')
    await loadVersions('epics')
    first.resolve({ versions: ['old'], state: 'supported' })
    await older

    expect(versions.value).toEqual(['new'])
  })

  it('qualifies feature and version requests with the selected project', async () => {
    window.location.hash = '#/releases/execute?projectId=flightctl'
    window.dispatchEvent(new Event('urlchange'))
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', state: 'unavailable', versions: [] })
      return Promise.resolve({ projectId: 'flightctl', state: 'unavailable', features: [], featureCount: 0 })
    })

    const traffic = useFeatureTraffic()
    const versions = useVersions()
    await Promise.all([traffic.loadFeatures(), versions.loadVersions()])

    expect(mockApiRequest).toHaveBeenCalledWith('/modules/releases/execution/features?projectId=flightctl')
    expect(mockApiRequest).toHaveBeenCalledWith('/modules/releases/execution/versions?projectId=flightctl')
    expect(traffic.state.value).toBe('unavailable')
    expect(versions.state.value).toBe('unavailable')
    expect(traffic.features.value).toEqual([])
    expect(versions.versions.value).toEqual([])
  })
})

describe('useEpicsByRelease', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    window.location.hash = '#/releases/execute?projectId=osac'
    window.dispatchEvent(new Event('urlchange'))
  })

  it('clears the previous release freshness when the next release fails to load', async () => {
    mockApiRequest.mockResolvedValueOnce({ features: [{ key: 'OSAC-1', epics: [] }], fetchedAt: '2026-10-26T08:00:00Z', state: 'supported' })
    const { features, fetchedAt, error, loadEpicsByRelease } = useEpicsByRelease()

    await loadEpicsByRelease('0.4')
    expect(fetchedAt.value).toBe('2026-10-26T08:00:00Z')

    mockApiRequest.mockRejectedValueOnce(new Error('Server error'))
    await loadEpicsByRelease('0.5')

    expect(error.value).toBe('Server error')
    expect(features.value).toEqual([])
    expect(fetchedAt.value).toBeNull()
  })

  it('clears the previous release freshness as soon as the next release starts loading', async () => {
    mockApiRequest.mockResolvedValueOnce({ features: [], fetchedAt: '2026-10-26T08:00:00Z', state: 'empty' })
    const { fetchedAt, loading, loadEpicsByRelease } = useEpicsByRelease()
    await loadEpicsByRelease('0.4')

    const next = deferred()
    mockApiRequest.mockReturnValueOnce(next.promise)
    const pending = loadEpicsByRelease('0.5')
    expect(loading.value).toBe(true)
    expect(fetchedAt.value).toBeNull()

    next.resolve({ features: [], fetchedAt: '2026-10-27T08:00:00Z', state: 'empty' })
    await pending
    expect(fetchedAt.value).toBe('2026-10-27T08:00:00Z')
  })
})
