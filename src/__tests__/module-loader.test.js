import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { installChunkLoadRecovery } from '../module-loader'

function dispatchPreloadError() {
  const event = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('installChunkLoadRecovery', () => {
  let reloadSpy

  // Installed once: the listener is a permanent app-lifetime singleton in
  // production, and window.addEventListener would otherwise stack a new
  // listener per test since jsdom's window persists across tests in a file.
  beforeAll(() => {
    installChunkLoadRecovery()
  })

  beforeEach(() => {
    sessionStorage.clear()
    reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reloads once on a chunk preload error', () => {
    const event = dispatchPreloadError()

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not reload again for a second failure shortly after (loop guard)', () => {
    dispatchPreloadError()
    const second = dispatchPreloadError()

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('allows recovery again once the guard window has elapsed', () => {
    vi.useFakeTimers()
    dispatchPreloadError()
    vi.advanceTimersByTime(11_000)
    dispatchPreloadError()

    expect(reloadSpy).toHaveBeenCalledTimes(2)
  })

  it('does not install a listener for unrelated errors', () => {
    window.dispatchEvent(new Event('error'))
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
