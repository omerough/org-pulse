import { describe, it, expect } from 'vitest'
import {
  resolveMemberRole,
  resolveMemberManager,
  resolveMemberLocation,
  memberCanonicalIdentity,
  deriveHeadcountByRole,
  UNKNOWN_ROLE
} from '../../client/utils/member-resolution'

describe('resolveMemberManager', () => {
  const people = [{ accountId: 'mgr-1', displayName: 'Manager One' }]
  const auxiliaryManagers = { 'ext-uid': { ldapUid: 'ext-uid', displayName: 'External Manager' } }
  const managerNames = { 'osac-mgr': 'Legacy Manager' }
  const ctx = { people, auxiliaryManagers, managerNames }

  it('resolves a roster managerRef to a linkable roster identity by accountId', () => {
    const m = resolveMemberManager({ managerRef: { kind: 'roster', accountId: 'mgr-1' } }, ctx)
    expect(m).toEqual({ name: 'Manager One', link: { accountId: 'mgr-1' } })
  })

  it('leaves a roster managerRef unavailable when the accountId is not in the project', () => {
    expect(resolveMemberManager({ managerRef: { kind: 'roster', accountId: 'missing' } }, ctx)).toBeNull()
  })

  it('resolves an external managerRef to a validated name without a link', () => {
    const m = resolveMemberManager({ managerRef: { kind: 'external', ldapUid: 'ext-uid' } }, ctx)
    expect(m).toEqual({ name: 'External Manager', link: null })
  })

  it('leaves an external managerRef unavailable when no auxiliary manager matches', () => {
    expect(resolveMemberManager({ managerRef: { kind: 'external', ldapUid: 'unknown' } }, ctx)).toBeNull()
  })

  it('reports an unresolved managerRef as unavailable', () => {
    expect(resolveMemberManager({ managerRef: { kind: 'unresolved', reason: 'no-match' } }, ctx)).toBeNull()
  })

  it('resolves a legacy OSAC uid via managerNames with a uid link', () => {
    const m = resolveMemberManager({ managerUid: 'osac-mgr' }, ctx)
    expect(m).toEqual({ name: 'Legacy Manager', link: { uid: 'osac-mgr' } })
  })

  it('shows an unresolved legacy uid as raw text without a link', () => {
    expect(resolveMemberManager({ manager: 'orphan-uid' }, ctx)).toEqual({ name: 'orphan-uid', link: null })
  })

  it('returns null when no manager reference exists', () => {
    expect(resolveMemberManager({ name: 'Nobody' }, ctx)).toBeNull()
  })

  it('resolves a roster managerRef through a prebuilt accountId lookup', () => {
    const peopleByAccountId = new Map(people.map(p => [p.accountId, p]))
    const m = resolveMemberManager({ managerRef: { kind: 'roster', accountId: 'mgr-1' } }, { peopleByAccountId, auxiliaryManagers, managerNames })
    expect(m).toEqual({ name: 'Manager One', link: { accountId: 'mgr-1' } })
  })
})

describe('resolveMemberLocation', () => {
  it('combines city and country', () => {
    expect(resolveMemberLocation({ city: 'Cork', country: 'IE' })).toBe('Cork, IE')
  })

  it('falls back to a published location string, never to geo', () => {
    expect(resolveMemberLocation({ location: 'Remote', geo: 'EMEA' })).toBe('Remote')
    expect(resolveMemberLocation({ geo: 'EMEA' })).toBeNull()
  })

  it('prefers a richer location string over a lone city when country is missing', () => {
    expect(resolveMemberLocation({ city: 'Cork', location: 'Cork, Ireland' })).toBe('Cork, Ireland')
    expect(resolveMemberLocation({ city: 'Cork' })).toBe('Cork')
  })
})

describe('resolveMemberRole', () => {
  it('prefers Engineering Speciality, then flat fields, then title', () => {
    const defs = [{ id: 'f1', label: 'Engineering Speciality' }]
    expect(resolveMemberRole({ customFields: { f1: 'QE' }, title: 'Engineer' }, defs)).toBe('QE')
    expect(resolveMemberRole({ title: 'Engineer' })).toBe('Engineer')
    expect(resolveMemberRole({ name: 'No Role' })).toBeNull()
  })
})

describe('memberCanonicalIdentity', () => {
  it('prefers accountId, then uid, then display name', () => {
    expect(memberCanonicalIdentity({ accountId: 'a', uid: 'u', name: 'N' })).toBe('a')
    expect(memberCanonicalIdentity({ uid: 'u', name: 'N' })).toBe('u')
    expect(memberCanonicalIdentity({ name: 'N' })).toBe('N')
  })
})

describe('deriveHeadcountByRole', () => {
  it('buckets missing roles as Unknown and keeps total equal to unique membership', () => {
    const members = [
      { accountId: 'a', title: 'Engineer' },
      { accountId: 'b', title: 'Engineer' },
      { accountId: 'c' }
    ]
    expect(deriveHeadcountByRole(members)).toEqual({
      byRole: { Engineer: 2, [UNKNOWN_ROLE]: 1 },
      totalHeadcount: 3
    })
  })

  it('deduplicates by canonical identity', () => {
    const members = [
      { accountId: 'a', title: 'Engineer' },
      { accountId: 'a', title: 'Engineer' }
    ]
    expect(deriveHeadcountByRole(members).totalHeadcount).toBe(1)
  })
})
