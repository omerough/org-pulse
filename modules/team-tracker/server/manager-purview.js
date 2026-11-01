const { getDirectReports, buildManagerMap, getManagedUids } = require('../../../shared/server/permissions');

/**
 * Compute the teams a manager has purview over based on their
 * direct reports' team assignments.
 * @param {string} managerUid
 * @param {object} registry - { people: { uid: { managerUid, teamIds, _appFields, ... } } }
 * @param {object} teamsData - { teams: { teamId: { id, name, orgKey, metadata, ... } } }
 * @param {object} [options]
 * @param {boolean} [options.includeIndirect=false] - Include indirect reports (transitive closure)
 * @returns {{ directReportUids: string[], indirectReportUids?: string[], teams: Array<{ id, name, orgKey, directReportUids: string[], totalMemberCount: number, metadata: object, boards: Array }> }}
 */
function getManagerPurview(managerUid, registry, teamsData, options = {}) {
  const directReportUidSet = getDirectReports(managerUid, registry);
  const directReportUids = [...directReportUidSet];

  let indirectReportUids;
  if (options.includeIndirect) {
    const managerMap = buildManagerMap(registry);
    const allManaged = getManagedUids(managerUid, managerMap);
    indirectReportUids = [...allManaged].filter(uid => !directReportUidSet.has(uid));
  }

  // All report UIDs to consider for team building
  const allReportUids = options.includeIndirect
    ? [...directReportUids, ...indirectReportUids]
    : directReportUids;

  if (!teamsData || !teamsData.teams) {
    const result = { directReportUids, teams: [] };
    if (options.includeIndirect) result.indirectReportUids = indirectReportUids;
    return result;
  }

  // Build a map: teamId -> list of direct report UIDs on that team
  const teamDirectReports = new Map();
  for (const uid of directReportUids) {
    const person = registry.people[uid];
    if (!person || !Array.isArray(person.teamIds)) continue;
    for (const teamId of person.teamIds) {
      if (!teamDirectReports.has(teamId)) {
        teamDirectReports.set(teamId, []);
      }
      teamDirectReports.get(teamId).push(uid);
    }
  }

  // Track which teams have any reports (direct or indirect) for team inclusion
  const teamsWithReports = new Set();
  for (const uid of allReportUids) {
    const person = registry.people[uid];
    if (!person || !Array.isArray(person.teamIds)) continue;
    for (const teamId of person.teamIds) {
      teamsWithReports.add(teamId);
    }
  }

  // Build a map: teamId -> total member count (all people assigned to the team)
  const teamMemberCounts = new Map();
  if (registry && registry.people) {
    for (const person of Object.values(registry.people)) {
      if (person.status !== 'active') continue;
      if (!Array.isArray(person.teamIds)) continue;
      for (const teamId of person.teamIds) {
        teamMemberCounts.set(teamId, (teamMemberCounts.get(teamId) || 0) + 1);
      }
    }
  }

  // Build the teams array from teams where at least one report is assigned
  const teams = [];
  for (const teamId of teamsWithReports) {
    const teamObj = teamsData.teams[teamId];
    if (!teamObj) continue;
    teams.push({
      id: teamObj.id,
      name: teamObj.name,
      orgKey: teamObj.orgKey,
      directReportUids: teamDirectReports.get(teamId) || [],
      totalMemberCount: teamMemberCounts.get(teamId) || 0,
      metadata: teamObj.metadata || {},
      boards: teamObj.boards || []
    });
  }

  const result = { directReportUids, teams };
  if (options.includeIndirect) result.indirectReportUids = indirectReportUids;
  return result;
}

const EXTERNAL_NODE_PREFIX = 'ldap:';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Registry key for an auxiliary (external) manager; roster people are keyed by accountId. */
function externalNodeKey(ldapUid) {
  return `${EXTERNAL_NODE_PREFIX}${ldapUid}`;
}

/** Registry key for a resolved manager identity. */
function projectManagerNodeKey(identity) {
  return identity.kind === 'external' ? externalNodeKey(identity.ldapUid) : identity.accountId;
}

/**
 * Adapts a project-qualified roster read model into the `{ registry, teamsData }`
 * shapes getManagerPurview consumes, so projects reuse the OSAC hierarchy engine.
 *
 * Roster people are keyed by `accountId`; each auxiliary manager is an extra node
 * keyed `ldap:<ldapUid>` (no accountId, no teams). A managerRef becomes a
 * `managerUid` edge only when its target exists in the model: `roster` refs
 * target a roster person, `external` refs target an auxiliary manager. Unknown,
 * `unresolved`, dangling and self-referencing refs produce no edge (the
 * relationship stays on the record for display, never fabricated).
 */
function buildProjectManagerModel(model) {
  const people = {};
  const teams = {};
  if (!model || typeof model !== 'object') {
    return { registry: { people }, teamsData: { teams } };
  }

  // A missing/blank accountId can't be a registry key without colliding across records.
  const validPeople = (model.people || []).filter(p => p && typeof p.accountId === 'string' && p.accountId);
  const accountIds = new Set(validPeople.map(p => p.accountId));
  const auxiliaryManagers = isRecord(model.auxiliaryManagers) ? model.auxiliaryManagers : {};
  const externalKeys = new Set(
    Object.keys(auxiliaryManagers).map(externalNodeKey).filter(key => !accountIds.has(key))
  );

  function resolveManagerKey(ref, ownKey) {
    if (!isRecord(ref)) return null;
    let target = null;
    if (ref.kind === 'roster' && accountIds.has(ref.accountId)) target = ref.accountId;
    else if (ref.kind === 'external' && externalKeys.has(externalNodeKey(ref.ldapUid))) target = externalNodeKey(ref.ldapUid);
    return target !== ownKey ? target : null;
  }

  for (const person of validPeople) {
    const ref = person.managerRef;
    people[person.accountId] = {
      uid: person.accountId,
      accountId: person.accountId,
      projectId: model.projectId,
      name: person.displayName,
      email: person.email || null,
      title: person.title || null,
      status: person.active ? 'active' : 'inactive',
      managerUid: resolveManagerKey(ref, person.accountId),
      managerRef: ref || null,
      teamIds: Array.isArray(person.teamIds) ? [...person.teamIds] : []
    };
  }

  for (const [ldapUid, record] of Object.entries(auxiliaryManagers)) {
    const key = externalNodeKey(ldapUid);
    if (!externalKeys.has(key)) continue;
    const ref = record.managerRef;
    people[key] = {
      uid: key,
      accountId: null,
      ldapUid,
      external: true,
      projectId: model.projectId,
      name: record.displayName,
      email: null,
      title: record.title || null,
      status: 'active',
      managerUid: resolveManagerKey(ref, key),
      managerRef: ref || null,
      teamIds: []
    };
  }

  for (const team of model.teams || []) {
    teams[team.id] = {
      id: team.id,
      name: team.displayName,
      // In a project read model every team belongs to the one project, so the
      // projectId plays the org-scoping role that orgKey plays for OSAC.
      orgKey: model.projectId,
      metadata: {},
      boards: []
    };
  }

  return { registry: { people }, teamsData: { teams } };
}

/**
 * Resolve the authenticated user to a manager identity, never by name. Fails
 * closed (null) on any ambiguity.
 *
 *  1. Exact, case-insensitive email match against active roster people.
 *  2. Otherwise the email's local part against verified identities only: the
 *     `ldapUid` of active roster people (set solely for a matched + joined
 *     enrichment) and the keys of `auxiliaryManagers`.
 *
 * The email domain is ignored in step 2: the OpenShift OAuth proxy reports
 * `<username>@cluster.local`, so the username is the only identity claim. It is
 * trusted exactly as far as role matching trusts it (role-store normalizes every
 * email to the configured auth domain), which assumes the cluster's identity
 * providers issue usernames equal to the person's LDAP uid and never reuse one.
 *
 * @returns {{ kind: 'roster', accountId: string } | { kind: 'external', ldapUid: string } | null}
 */
function resolveProjectManagerIdentity(model, email) {
  if (!model || typeof email !== 'string') return null;
  const target = email.toLowerCase();
  const parts = target.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const activePeople = (model.people || []).filter(
    p => p && p.active && typeof p.accountId === 'string' && p.accountId
  );

  const emailMatches = new Set();
  for (const person of activePeople) {
    if (person.email && person.email.toLowerCase() === target) emailMatches.add(person.accountId);
  }
  if (emailMatches.size === 1) return { kind: 'roster', accountId: [...emailMatches][0] };
  if (emailMatches.size > 1) return null;

  const localPart = parts[0];
  const candidates = new Map();
  for (const person of activePeople) {
    if (typeof person.ldapUid === 'string' && person.ldapUid.trim().toLowerCase() === localPart) {
      candidates.set(`roster:${person.accountId}`, { kind: 'roster', accountId: person.accountId });
    }
  }
  if (isRecord(model.auxiliaryManagers)) {
    for (const ldapUid of Object.keys(model.auxiliaryManagers)) {
      if (ldapUid.toLowerCase() === localPart) {
        candidates.set(`external:${ldapUid}`, { kind: 'external', ldapUid });
      }
    }
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

module.exports = {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerIdentity,
  projectManagerNodeKey
};
