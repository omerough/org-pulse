import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApiRequest = vi.fn()
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))

import { useEpicsByRelease } from '../../../client/execute/composables/useFeatureTraffic.js'

describe('useEpicsByRelease', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
  })

  it('clears loading when called with no version while a request is in flight', async () => {
    let resolveInFlight
    mockApiRequest.mockReturnValue(new Promise((resolve) => { resolveInFlight = resolve }))

    const { loading, error, features, loadEpicsByRelease } = useEpicsByRelease()

    const inFlight = loadEpicsByRelease('0.4')
    expect(loading.value).toBe(true)

    // Version cleared before the in-flight request resolves — must not leave loading stuck true.
    await loadEpicsByRelease('')
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(features.value).toEqual([])

    resolveInFlight({ features: [{ key: 'OSAC-100' }], fetchedAt: null })
    await inFlight

    // The stale in-flight response must not overwrite the cleared state.
    expect(features.value).toEqual([])
    expect(loading.value).toBe(false)
  })
})
