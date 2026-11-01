import { describe, it, expect, afterEach } from 'vitest'
import { pickDefaultRelease, parseGaDate } from '../../../client/execute/utils/releaseDefault'
import { OSAC_REGISTRY_RELEASES, OSAC_AVAILABLE_VERSIONS } from './uiEpicsFixture'

const release = (id, ga, extra = {}) => ({
  id, displayName: id, fixVersions: [id], state: 'active', milestones: ga ? { ga } : {}, ...extra
})
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h)
const pick = (registryReleases, today, availableVersions) => pickDefaultRelease({
  registryReleases,
  availableVersions: availableVersions || registryReleases.flatMap(r => r.fixVersions),
  today
})

describe('pickDefaultRelease', () => {
  it('picks the nearest upcoming GA', () => {
    const releases = [release('a', '2026-12-01'), release('b', '2026-11-10'), release('c', '2027-01-01')]
    expect(pick(releases, local(2026, 11, 1))).toEqual({ version: 'b', reason: 'next-ga' })
  })

  it('keeps a release upcoming through its GA day and drops it the day after', () => {
    const releases = [release('a', '2026-11-10'), release('b', '2026-12-01')]
    expect(pick(releases, local(2026, 11, 10, 23)).version).toBe('a')
    expect(pick(releases, local(2026, 11, 11, 0)).version).toBe('b')
  })

  it('picks a release whose work started before today but whose GA is ahead', () => {
    const releases = [release('a', null, { milestones: { releaseStart: '2026-08-01', ga: '2026-11-30' } })]
    expect(pick(releases, local(2026, 11, 1)).version).toBe('a')
  })

  it('falls back to the latest past GA when every GA has passed', () => {
    const releases = [release('a', '2026-01-01'), release('b', '2026-03-01'), release('c', '2026-02-01')]
    expect(pick(releases, local(2026, 11, 1))).toEqual({ version: 'b', reason: 'latest-ga' })
  })

  it('returns no pick for a missing, empty or non-array registry', () => {
    for (const registry of [undefined, null, [], {}]) {
      expect(pickDefaultRelease({ registryReleases: registry, availableVersions: ['a'], today: new Date() }))
        .toEqual({ version: null, reason: 'no-registry' })
    }
  })

  it('returns no pick when no release maps to an available version', () => {
    expect(pick([release('a', '2026-12-01')], local(2026, 11, 1), ['other'])).toEqual({ version: null, reason: 'no-match' })
  })

  it('never picks a release without a bare-date GA or a non-active one', () => {
    const releases = [
      release('backlog', null),
      release('badDate', '2026-12-01T00:00:00Z'),
      release('archived', '2026-11-05', { state: 'archived' }),
      release('ok', '2027-02-01')
    ]
    expect(pick(releases, local(2026, 11, 1)).version).toBe('ok')
  })

  it('uses the first available fix version in registry order', () => {
    const releases = [release('multi', '2026-12-01', { fixVersions: ['x', 'y', 'z'] })]
    expect(pick(releases, local(2026, 11, 1), ['z', 'y']).version).toBe('y')
  })

  it('breaks GA ties by registry id', () => {
    const releases = [release('b', '2026-12-01'), release('a', '2026-12-01')]
    expect(pick(releases, local(2026, 11, 1)).version).toBe('a')
  })

  it('resolves the real OSAC registry to 0.4 on 2026-10-26 and 0.5 on 2026-11-01', () => {
    const on = today => pickDefaultRelease({
      registryReleases: OSAC_REGISTRY_RELEASES, availableVersions: OSAC_AVAILABLE_VERSIONS, today
    })
    expect(on(local(2026, 10, 26)).version).toBe('0.4')
    expect(on(local(2026, 11, 1)).version).toBe('0.5')
  })
})

describe('parseGaDate', () => {
  const originalTz = process.env.TZ
  afterEach(() => { process.env.TZ = originalTz })

  it('parses bare dates as local calendar days west of UTC', () => {
    process.env.TZ = 'America/Los_Angeles'
    const date = parseGaDate('2026-11-30')
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 30])
  })

  it('rejects anything but a bare YYYY-MM-DD string', () => {
    for (const value of [undefined, null, '', '2026-11-30T00:00:00Z', '11/30/2026', 20261130]) {
      expect(parseGaDate(value)).toBeNull()
    }
  })
})
