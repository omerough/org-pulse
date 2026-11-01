/**
 * Maps legacy deep links onto a normalized roster model. Only an exact, unambiguous
 * match resolves; any collision is `{ unresolved: true }`, never a preferred side.
 */

const UNRESOLVED = Object.freeze({ unresolved: true })

function nonEmptyString(value) {
  return typeof value === 'string' && value !== ''
}

/**
 * `uid` may name any roster person or an external manager, compared case-insensitively
 * like the server's manager identity resolution; `person` only an active roster person,
 * by exact display name.
 */
export function resolveLegacyPersonLink(model, { uid, person } = {}) {
  if (nonEmptyString(uid)) {
    const key = uid.toLowerCase()
    const rosterMatches = (model?.people || []).filter(
      p => typeof p.ldapUid === 'string' && p.ldapUid.toLowerCase() === key
    )
    const auxiliaryUids = Object.keys(model?.auxiliaryManagers || {}).filter(u => u.toLowerCase() === key)
    if (rosterMatches.length + auxiliaryUids.length !== 1) return UNRESOLVED
    return rosterMatches.length === 1
      ? { accountId: rosterMatches[0].accountId }
      : { ldapUid: auxiliaryUids[0] }
  }

  if (nonEmptyString(person)) {
    const matches = (model?.people || []).filter(p => p.active && p.displayName === person)
    return matches.length === 1 ? { accountId: matches[0].accountId } : UNRESOLVED
  }

  return UNRESOLVED
}

/**
 * An exact canonical key is authoritative; otherwise the suffix is read as a team ID or
 * display name and must match exactly one team.
 */
export function resolveLegacyTeamKey(model, projectId, teamKey) {
  const teams = model?.teams
  if (!Array.isArray(teams) || !nonEmptyString(teamKey) || !nonEmptyString(projectId)) return UNRESOLVED

  const exact = teams.find(t => t.key === teamKey)
  if (exact) return { teamKey: exact.key }

  const separatorIndex = teamKey.indexOf('::')
  const prefix = separatorIndex === -1 ? null : teamKey.slice(0, separatorIndex)
  const suffix = separatorIndex === -1 ? teamKey : teamKey.slice(separatorIndex + 2)
  if (suffix === '' || (prefix !== null && prefix.toLowerCase() !== projectId.toLowerCase())) return UNRESOLVED

  const canonicalKey = `${projectId}::${suffix}`
  const candidates = new Map()
  for (const team of teams) {
    if (team.key === canonicalKey || team.displayName === suffix) candidates.set(team.key, team)
  }
  return candidates.size === 1 ? { teamKey: [...candidates.keys()][0] } : UNRESOLVED
}
