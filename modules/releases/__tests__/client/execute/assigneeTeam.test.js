import { describe, it, expect } from 'vitest'
import {
  ASSIGNEE_TEAM_UNASSIGNED,
  ASSIGNEE_TEAM_NOT_IN_ROSTER,
  buildAssigneeTeamLookup,
  assigneeTeamMembership,
  matchesAssigneeTeam,
  assigneeTeamLabel,
  collectAssigneeTeamOptions
} from '../../../client/execute/utils/assigneeTeam'

const team = (id, displayName, memberAccountIds) => ({ key: `p::${id}`, id, displayName, memberAccountIds })
const person = (accountId, displayName, teamIds, active = true) => ({ accountId, displayName, teamIds, active })

function roster(overrides = {}) {
  return {
    projectId: 'p',
    availability: 'available',
    teams: [
      team('core', 'Core', ['single', 'admin', 'twin-a']),
      team('ui', 'UI', ['multi', 'admin']),
      team('ops', 'Ops', ['multi', 'admin'])
    ],
    people: [
      person('single', 'Sam Single', ['core']),
      person('multi', 'Mia Multi', ['ui', 'ops']),
      person('admin', 'Amir Admin', ['core', 'ui', 'ops']),
      person('gone', 'Gil Gone', ['core'], false),
      person('twin-a', 'Pat Twin', ['core']),
      person('twin-b', 'Pat Twin', [])
    ],
    ...overrides
  }
}

const lookup = () => buildAssigneeTeamLookup(roster(), 'p')
const feat = (assigneeAccountId, assignee = assigneeAccountId ? 'Someone' : null) => ({ key: 'F-1', assignee, assigneeAccountId })

describe('buildAssigneeTeamLookup', () => {
  it.each([
    ['no project', roster(), ''],
    ['another project', roster({ projectId: 'q' }), 'p'],
    ['legacy roster shape', { orgs: {} }, 'p'],
    ['unavailable publication', roster({ availability: 'unavailable', teams: [], people: [] }), 'p'],
    ['no roster loaded', null, 'p']
  ])('returns null for %s', (_name, data, projectId) => {
    expect(buildAssigneeTeamLookup(data, projectId)).toBeNull()
  })

  it('accepts a published roster without active memberships', () => {
    expect(buildAssigneeTeamLookup(roster({ availability: 'empty' }), 'p')).not.toBeNull()
  })
})

describe('assigneeTeamMembership', () => {
  it('maps a single-team assignee by accountId', () => {
    expect(assigneeTeamMembership(feat('single'), lookup())).toEqual({ kind: 'member', teamKeys: ['p::core'] })
  })

  it('keeps every real membership of a multi-team assignee', () => {
    expect(assigneeTeamMembership(feat('multi'), lookup()).teamKeys.sort()).toEqual(['p::ops', 'p::ui'])
  })

  it('classifies a Feature with no assignee as unassigned', () => {
    expect(assigneeTeamMembership(feat(null, null), lookup()).kind).toBe('unassigned')
  })

  it('classifies an accountId absent from a loaded roster as not-in-roster', () => {
    expect(assigneeTeamMembership(feat('stranger'), lookup()).kind).toBe('not-in-roster')
  })

  it('does not call an assignee not-in-roster when the roster is unavailable', () => {
    expect(assigneeTeamMembership(feat('stranger'), null).kind).toBe('unknown')
    expect(assigneeTeamMembership(feat(null, null), null).kind).toBe('unassigned')
  })

  it('treats an assignee without a published accountId as unknown, never joined by name', () => {
    expect(assigneeTeamMembership(feat(null, 'Mia Multi'), lookup())).toEqual({ kind: 'unknown', teamKeys: [] })
  })

  it('keeps an inactive roster person in the roster but outside team membership', () => {
    expect(assigneeTeamMembership(feat('gone'), lookup())).toEqual({ kind: 'member', teamKeys: [] })
  })

  it('separates people who share a display name by accountId', () => {
    expect(assigneeTeamMembership(feat('twin-a', 'Pat Twin'), lookup()).teamKeys).toEqual(['p::core'])
    expect(assigneeTeamMembership(feat('twin-b', 'Pat Twin'), lookup()).teamKeys).toEqual([])
  })
})

describe('matchesAssigneeTeam', () => {
  it('matches everything when nothing is selected', () => {
    expect(matchesAssigneeTeam(feat('stranger'), lookup(), [])).toBe(true)
  })

  it('matches a multi-team assignee under each of their team filters only', () => {
    const f = feat('multi')
    expect(matchesAssigneeTeam(f, lookup(), ['p::ui'])).toBe(true)
    expect(matchesAssigneeTeam(f, lookup(), ['p::ops'])).toBe(true)
    expect(matchesAssigneeTeam(f, lookup(), ['p::core'])).toBe(false)
  })

  it('matches the union of selected teams', () => {
    expect(matchesAssigneeTeam(feat('single'), lookup(), ['p::ui', 'p::core'])).toBe(true)
  })

  it('does not attribute a Feature to teams its assignee is not in because someone else is', () => {
    // 'admin' belongs to all three teams; a Feature assigned to 'single' stays Core-only.
    expect(matchesAssigneeTeam(feat('single'), lookup(), ['p::ui'])).toBe(false)
    expect(matchesAssigneeTeam(feat('single'), lookup(), ['p::ops'])).toBe(false)
  })

  it('matches Unassigned and Not in Roster only through their own options', () => {
    expect(matchesAssigneeTeam(feat(null, null), lookup(), [ASSIGNEE_TEAM_UNASSIGNED])).toBe(true)
    expect(matchesAssigneeTeam(feat(null, null), lookup(), ['p::core'])).toBe(false)
    expect(matchesAssigneeTeam(feat('stranger'), lookup(), [ASSIGNEE_TEAM_NOT_IN_ROSTER])).toBe(true)
    expect(matchesAssigneeTeam(feat('stranger'), lookup(), [ASSIGNEE_TEAM_UNASSIGNED])).toBe(false)
    expect(matchesAssigneeTeam(feat('single'), lookup(), [ASSIGNEE_TEAM_NOT_IN_ROSTER])).toBe(false)
  })

  it('never matches an identity-less assignee to a bucket', () => {
    const f = feat(null, 'Mia Multi')
    expect(matchesAssigneeTeam(f, lookup(), [ASSIGNEE_TEAM_UNASSIGNED, ASSIGNEE_TEAM_NOT_IN_ROSTER, 'p::ui'])).toBe(false)
  })
})

describe('collectAssigneeTeamOptions', () => {
  it('lists present teams by name, then Unassigned and Not in Roster', () => {
    const options = collectAssigneeTeamOptions(
      [feat('multi'), feat('single'), feat(null, null), feat('stranger')],
      lookup()
    )
    expect(options).toEqual(['p::core', 'p::ops', 'p::ui', ASSIGNEE_TEAM_UNASSIGNED, ASSIGNEE_TEAM_NOT_IN_ROSTER])
    expect(options.map(o => assigneeTeamLabel(o, lookup()))).toEqual(['Core', 'Ops', 'UI', 'Unassigned', 'Not in Roster'])
  })

  it('omits options no Feature matches and offers no buckets for unknown assignees', () => {
    expect(collectAssigneeTeamOptions([feat('single'), feat(null, 'No Id')], lookup())).toEqual(['p::core'])
  })
})
