import { describe, it, expect } from 'vitest'
import {
  resolveLegacyPersonLink,
  resolveLegacyTeamKey
} from '../../client/utils/legacy-link-resolution'

const person = (accountId, displayName, extra = {}) => ({ accountId, displayName, active: true, ...extra })

describe('resolveLegacyPersonLink', () => {
  const model = {
    people: [
      person('acc-1', 'Alice Chen', { ldapUid: 'achen' }),
      person('acc-2', 'Bob Smith', { ldapUid: 'bsmith' }),
      person('acc-3', 'Gone Person', { ldapUid: 'gone', active: false }),
      person('acc-4', 'No Enrichment')
    ],
    auxiliaryManagers: {
      demovp: { ldapUid: 'demovp', displayName: 'Demo VP' }
    }
  }

  describe('uid links', () => {
    it('resolves a uid to the one roster person with that ldapUid', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'achen' })).toEqual({ accountId: 'acc-1' })
    })

    it('resolves an inactive roster person', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'gone' })).toEqual({ accountId: 'acc-3' })
    })

    it('resolves a uid that only names an external manager to an ldapUid profile', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'demovp' })).toEqual({ ldapUid: 'demovp' })
    })

    it('is unresolved when nothing matches the uid', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'nobody' })).toEqual({ unresolved: true })
    })

    it('matches the uid case-insensitively, like the server identity resolver', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'AChen' })).toEqual({ accountId: 'acc-1' })
    })

    it('returns the published casing for an external manager matched by a differently-cased uid', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'DemoVP' })).toEqual({ ldapUid: 'demovp' })
    })

    it('is unresolved when two uids differ only by case', () => {
      const cased = {
        people: [person('a', 'A', { ldapUid: 'Pat' }), person('b', 'B', { ldapUid: 'pat' })],
        auxiliaryManagers: { Sam: { ldapUid: 'Sam', displayName: 'Sam' }, sam: { ldapUid: 'sam', displayName: 'sam' } }
      }
      expect(resolveLegacyPersonLink(cased, { uid: 'pat' })).toEqual({ unresolved: true })
      expect(resolveLegacyPersonLink(cased, { uid: 'SAM' })).toEqual({ unresolved: true })
    })

    it('is unresolved when a roster uid and an external manager key collide only by case', () => {
      const collision = {
        people: [person('acc-1', 'Alice Chen', { ldapUid: 'Shared' })],
        auxiliaryManagers: { shared: { ldapUid: 'shared', displayName: 'Shared Manager' } }
      }
      expect(resolveLegacyPersonLink(collision, { uid: 'shared' })).toEqual({ unresolved: true })
    })

    it('is unresolved when two roster people share the uid', () => {
      const dup = { people: [person('a', 'A', { ldapUid: 'same' }), person('b', 'B', { ldapUid: 'same', active: false })] }
      expect(resolveLegacyPersonLink(dup, { uid: 'same' })).toEqual({ unresolved: true })
    })

    it('is unresolved when a roster person and an external manager share the uid', () => {
      const collision = {
        people: [person('acc-1', 'Alice Chen', { ldapUid: 'shared' })],
        auxiliaryManagers: { shared: { ldapUid: 'shared', displayName: 'Shared Manager' } }
      }
      const result = resolveLegacyPersonLink(collision, { uid: 'shared' })
      expect(result).toEqual({ unresolved: true })
      expect(result).not.toHaveProperty('accountId')
      expect(result).not.toHaveProperty('ldapUid')
    })

    it('is unresolved when enrichment is absent', () => {
      const unenriched = { people: [person('acc-1', 'Alice Chen')] }
      expect(resolveLegacyPersonLink(unenriched, { uid: 'achen' })).toEqual({ unresolved: true })
    })

    it('does not resolve inherited object keys as external managers', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'constructor' })).toEqual({ unresolved: true })
      expect(resolveLegacyPersonLink(model, { uid: 'toString' })).toEqual({ unresolved: true })
    })

    it('uses the uid and ignores person when both are given', () => {
      expect(resolveLegacyPersonLink(model, { uid: 'nobody', person: 'Alice Chen' })).toEqual({ unresolved: true })
    })
  })

  describe('person name links', () => {
    it('resolves an exact displayName to the one active roster person', () => {
      expect(resolveLegacyPersonLink(model, { person: 'Bob Smith' })).toEqual({ accountId: 'acc-2' })
    })

    it('does not resolve an inactive person by name', () => {
      expect(resolveLegacyPersonLink(model, { person: 'Gone Person' })).toEqual({ unresolved: true })
    })

    it('is unresolved when two active people share the name', () => {
      const dup = { people: [person('a', 'Same Name'), person('b', 'Same Name')] }
      expect(resolveLegacyPersonLink(dup, { person: 'Same Name' })).toEqual({ unresolved: true })
    })

    it('requires an exact name match', () => {
      expect(resolveLegacyPersonLink(model, { person: 'bob smith' })).toEqual({ unresolved: true })
    })

    it('never resolves a name to an external manager', () => {
      expect(resolveLegacyPersonLink(model, { person: 'Demo VP' })).toEqual({ unresolved: true })
    })
  })

  describe('degenerate input', () => {
    it('is unresolved without a uid or person', () => {
      expect(resolveLegacyPersonLink(model, {})).toEqual({ unresolved: true })
      expect(resolveLegacyPersonLink(model)).toEqual({ unresolved: true })
      expect(resolveLegacyPersonLink(model, { uid: '', person: '' })).toEqual({ unresolved: true })
    })

    it('is unresolved without a model', () => {
      expect(resolveLegacyPersonLink(null, { uid: 'achen' })).toEqual({ unresolved: true })
      expect(resolveLegacyPersonLink({}, { person: 'Alice Chen' })).toEqual({ unresolved: true })
    })
  })
})

describe('resolveLegacyTeamKey', () => {
  const team = (id, displayName) => ({ key: `osac::${id}`, id, displayName })
  const model = {
    teams: [team('t-1', 'Platform'), team('t-2', 'Infrastructure'), team('t-3', 'Data Pipeline')]
  }

  it('keeps an exact canonical key', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'osac::t-1')).toEqual({ teamKey: 'osac::t-1' })
  })

  it('rewrites a legacy name key to the canonical key', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'osac::Platform')).toEqual({ teamKey: 'osac::t-1' })
  })

  it('matches the project prefix case-insensitively (display key)', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'OSAC::Infrastructure')).toEqual({ teamKey: 'osac::t-2' })
  })

  it('rewrites a case-variant canonical key', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'OSAC::t-3')).toEqual({ teamKey: 'osac::t-3' })
  })

  it('resolves a bare team name', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'Data Pipeline')).toEqual({ teamKey: 'osac::t-3' })
  })

  it('resolves a bare team ID', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 't-2')).toEqual({ teamKey: 'osac::t-2' })
  })

  it('matches the display name exactly, including case', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'osac::platform')).toEqual({ unresolved: true })
  })

  it('is unresolved when no team matches', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'osac::Nope')).toEqual({ unresolved: true })
  })

  it('is unresolved for another project prefix', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'flightctl::Platform')).toEqual({ unresolved: true })
  })

  it('is unresolved for an empty suffix', () => {
    expect(resolveLegacyTeamKey(model, 'osac', 'osac::')).toEqual({ unresolved: true })
  })

  it('rewrites when the suffix is both the ID and the displayName of the same team', () => {
    const same = { teams: [team('Alpha', 'Alpha'), team('t-2', 'Beta')] }
    expect(resolveLegacyTeamKey(same, 'osac', 'osac::Alpha')).toEqual({ teamKey: 'osac::Alpha' })
  })

  it('is unresolved when the suffix is one team ID and another team displayName', () => {
    const collision = { teams: [team('Platform', 'Core'), team('t-2', 'Platform')] }
    expect(resolveLegacyTeamKey(collision, 'osac', 'OSAC::Platform')).toEqual({ unresolved: true })
    expect(resolveLegacyTeamKey(collision, 'osac', 'Platform')).toEqual({ unresolved: true })
  })

  it('is unresolved when several teams share the displayName', () => {
    const dup = { teams: [team('t-1', 'Platform'), team('t-2', 'Platform')] }
    expect(resolveLegacyTeamKey(dup, 'osac', 'osac::Platform')).toEqual({ unresolved: true })
  })

  it('never rewrites an exact canonical key even when another team displayName collides', () => {
    const collision = { teams: [team('Platform', 'Core'), team('t-2', 'Platform')] }
    expect(resolveLegacyTeamKey(collision, 'osac', 'osac::Platform')).toEqual({ teamKey: 'osac::Platform' })
    expect(resolveLegacyTeamKey(collision, 'osac', 'osac::t-2')).toEqual({ teamKey: 'osac::t-2' })
    const keyEqualsOtherName = { teams: [team('t-1', 'Alpha'), team('Alpha', 'Beta')] }
    expect(resolveLegacyTeamKey(keyEqualsOtherName, 'osac', 'osac::Alpha')).toEqual({ teamKey: 'osac::Alpha' })
  })

  it('is unresolved without a normalized model, project, or key', () => {
    expect(resolveLegacyTeamKey(null, 'osac', 'osac::Platform')).toEqual({ unresolved: true })
    expect(resolveLegacyTeamKey({ orgs: [] }, 'osac', 'osac::Platform')).toEqual({ unresolved: true })
    expect(resolveLegacyTeamKey(model, '', 'osac::Platform')).toEqual({ unresolved: true })
    expect(resolveLegacyTeamKey(model, 'osac', '')).toEqual({ unresolved: true })
  })
})
