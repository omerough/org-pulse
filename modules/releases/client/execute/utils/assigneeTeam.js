// Assignee's Team: Feature Jira assigneeAccountId -> project roster person -> team memberships.
// This is membership of the assignee, never Feature ownership; display names are never joined.

// Internal sentinels; team options use the project-qualified team key from the roster read model.
export const ASSIGNEE_TEAM_UNASSIGNED = '__unassigned__'
export const ASSIGNEE_TEAM_NOT_IN_ROSTER = '__not-in-roster__'

// Returns null when the roster cannot support the join (wrong project, legacy shape, unavailable
// publication), so callers never mistake "roster unavailable" for "person not in roster".
// Team membership is the read model's active members; an inactive person is still in the roster.
export function buildAssigneeTeamLookup(roster, projectId) {
  if (!projectId || !roster || roster.projectId !== projectId) return null
  if (!Array.isArray(roster.teams) || !Array.isArray(roster.people)) return null
  if (roster.availability !== 'available' && roster.availability !== 'empty') return null

  const teamNames = new Map()
  const teamKeysByAccountId = new Map()
  for (const team of roster.teams) {
    teamNames.set(team.key, team.displayName)
    for (const accountId of team.memberAccountIds || []) {
      const keys = teamKeysByAccountId.get(accountId) || []
      keys.push(team.key)
      teamKeysByAccountId.set(accountId, keys)
    }
  }
  return { teamNames, teamKeysByAccountId, accountIds: new Set(roster.people.map(p => p.accountId)) }
}

// kind: 'unassigned' | 'not-in-roster' | 'member' | 'unknown'. An assignee without a published
// accountId (or without a usable roster) is 'unknown': it matches no team option.
export function assigneeTeamMembership(feature, lookup) {
  const accountId = feature.assigneeAccountId || null
  if (!feature.assignee && !accountId) return { kind: 'unassigned', teamKeys: [] }
  if (!lookup || !accountId) return { kind: 'unknown', teamKeys: [] }
  if (!lookup.accountIds.has(accountId)) return { kind: 'not-in-roster', teamKeys: [] }
  return { kind: 'member', teamKeys: lookup.teamKeysByAccountId.get(accountId) || [] }
}

export function matchesAssigneeTeam(feature, lookup, selected) {
  if (selected.length === 0) return true
  const { kind, teamKeys } = assigneeTeamMembership(feature, lookup)
  if (kind === 'unassigned') return selected.includes(ASSIGNEE_TEAM_UNASSIGNED)
  if (kind === 'not-in-roster') return selected.includes(ASSIGNEE_TEAM_NOT_IN_ROSTER)
  return teamKeys.some(key => selected.includes(key))
}

export function assigneeTeamLabel(value, lookup) {
  if (value === ASSIGNEE_TEAM_UNASSIGNED) return 'Unassigned'
  if (value === ASSIGNEE_TEAM_NOT_IN_ROSTER) return 'Not in Roster'
  return lookup?.teamNames.get(value) || value
}

// Only options that match at least one Feature, teams by name then the two explicit buckets.
export function collectAssigneeTeamOptions(features, lookup) {
  const teamKeys = new Set()
  let hasUnassigned = false
  let hasNotInRoster = false
  for (const feature of features) {
    const { kind, teamKeys: keys } = assigneeTeamMembership(feature, lookup)
    if (kind === 'unassigned') hasUnassigned = true
    else if (kind === 'not-in-roster') hasNotInRoster = true
    else keys.forEach(key => teamKeys.add(key))
  }
  const options = [...teamKeys].sort((a, b) =>
    assigneeTeamLabel(a, lookup).localeCompare(assigneeTeamLabel(b, lookup)) || a.localeCompare(b))
  if (hasUnassigned) options.push(ASSIGNEE_TEAM_UNASSIGNED)
  if (hasNotInRoster) options.push(ASSIGNEE_TEAM_NOT_IN_ROSTER)
  return options
}
