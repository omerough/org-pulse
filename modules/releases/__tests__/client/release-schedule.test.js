import { describe, it, expect } from 'vitest'
import {
  compareReleasesNewestFirst,
  isReleaseCandidate,
  releaseJiraUrl,
  releaseStatus
} from '../../client/utils/releaseSchedule.js'

const release = (name, ga) => ({ id: `p-${name}`, fixVersions: [name], milestones: ga ? { ga } : {} })
const sortedNames = releases => releases.slice().sort(compareReleasesNewestFirst).map(r => r.fixVersions[0])
const order = names => sortedNames(names.map(name => release(name)))

describe('isReleaseCandidate', () => {
  it.each(['0.10.0-rc1', '0.10.0-RC2', '1.2.rc3', '2.0 rc', '0.4-rc'])('detects %s', name => {
    expect(isReleaseCandidate(release(name))).toBe(true)
  })

  it.each(['0.10.0', '0.4.z', 'Backlog', 'src-1', '0.4-ga'])('does not flag %s', name => {
    expect(isReleaseCandidate(release(name))).toBe(false)
  })
})

describe('compareReleasesNewestFirst', () => {
  it('compares version segments numerically', () => {
    expect(order(['0.9', '0.10', '0.2'])).toEqual(['0.10', '0.9', '0.2'])
  })

  it('places z releases above their base and the .z placeholder above numbered z releases', () => {
    expect(order(['4.21.0', '4.21.z', '4.21.2', '4.20.5'])).toEqual(['4.21.z', '4.21.2', '4.21.0', '4.20.5'])
  })

  it('treats a missing segment as zero', () => {
    expect(order(['0.4', '0.4.1'])).toEqual(['0.4.1', '0.4'])
  })

  it('sorts a pre-release suffix below the plain version', () => {
    expect(order(['0.4-beta', '0.4', '0.3'])).toEqual(['0.4', '0.4-beta', '0.3'])
  })

  it('keeps undated future versions above older dated ones', () => {
    const list = [release('0.3', '2026-03-01'), release('0.5'), release('0.4', '2026-06-01')]
    expect(sortedNames(list)).toEqual(['0.5', '0.4', '0.3'])
  })

  it('puts names without a version number last, dated before undated', () => {
    const list = [release('Backlog'), release('GA', '2026-05-01'), release('0.1'), release('Early')]
    expect(sortedNames(list)).toEqual(['0.1', 'GA', 'Backlog', 'Early'])
  })

  it('orders equal versions by GA date, newest first', () => {
    const list = [release('0.4', '2026-01-01'), release('0.4', '2026-02-01')]
    expect(list.sort(compareReleasesNewestFirst).map(r => r.milestones.ga)).toEqual(['2026-02-01', '2026-01-01'])
  })

  it('falls back to the display name when no fix version is published', () => {
    const list = [{ id: 'a', displayName: 'RHOAI 2.14' }, { id: 'b', displayName: 'RHOAI 2.15' }]
    expect(list.sort(compareReleasesNewestFirst).map(r => r.id)).toEqual(['b', 'a'])
  })
})

describe('releaseStatus', () => {
  it('treats the Jira released flag as confirmed, even when a lifecycle is published', () => {
    expect(releaseStatus({ sourceFields: { released: true }, lifecycle: 'upcoming' }))
      .toEqual({ key: 'released', confirmed: true })
  })

  it('treats a published lifecycle as inferred', () => {
    expect(releaseStatus({ sourceFields: { released: false }, lifecycle: 'released' }))
      .toEqual({ key: 'released', confirmed: false })
  })

  it('reports an explicit unreleased flag when no lifecycle is derived', () => {
    expect(releaseStatus({ sourceFields: { released: false }, lifecycle: null }))
      .toEqual({ key: 'unreleased', confirmed: true })
  })

  it('has no status for entries without lifecycle or Jira flag', () => {
    expect(releaseStatus({ milestones: { ga: '2026-01-01' } })).toBeNull()
    expect(releaseStatus({ sourceFields: { released: null } })).toBeNull()
  })
})

describe('releaseJiraUrl', () => {
  it('returns the published https Jira version link', () => {
    const jiraUrl = 'https://redhat.atlassian.net/projects/EDM/versions/68316'
    expect(releaseJiraUrl({ jiraUrl })).toBe(jiraUrl)
  })

  it('rejects missing, malformed and non-https links', () => {
    expect(releaseJiraUrl({})).toBeNull()
    expect(releaseJiraUrl({ jiraUrl: null })).toBeNull()
    expect(releaseJiraUrl({ jiraUrl: 'not a url' })).toBeNull()
    expect(releaseJiraUrl({ jiraUrl: 'javascript:alert(1)' })).toBeNull()
    expect(releaseJiraUrl({ jiraUrl: 'http://redhat.atlassian.net/projects/EDM/versions/1' })).toBeNull()
  })
})
