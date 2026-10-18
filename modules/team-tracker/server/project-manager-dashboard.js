/**
 * Builds the OSAC `/manager/dashboard` downward-purview contract from a
 * project-qualified roster read model, reusing the shared hierarchy engine via
 * manager-purview's adapter (no second hierarchy implementation).
 *
 * Read-only: field/team writes belong to Admin/RBAC's project write model, so
 * field definitions, exceptions and reference-people maps stay empty rather than
 * being fabricated.
 */

const {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerAccountId
} = require('./manager-purview');

function emptyPurviewPayload(extra = {}) {
  return {
    mode: 'project',
    manager: null,
    directReports: [],
    indirectReports: [],
    teams: [],
    allOrgTeams: [],
    allPeople: [],
    referencedPeople: {},
    fieldDefinitions: { person: [], team: [] },
    fieldExceptions: [],
    ...extra
  };
}

function toReport(person, { indirect = false } = {}) {
  return {
    accountId: person.accountId,
    name: person.name,
    title: person.title || null,
    teamIds: Array.isArray(person.teamIds) ? [...person.teamIds] : [],
    managerRef: person.managerRef || null,
    indirect
  };
}

/**
 * Build the project Manager Dashboard response.
 *
 * @param {object} model - Normalized project read model from readProjectPeopleTeams
 * @param {object} options
 * @param {string|null} options.email - Authenticated user email (for identity resolution)
 * @param {boolean} [options.includeIndirect=false]
 * @param {boolean} [options.isPrivileged=false] - Admin or team-admin; controls
 *   whether a non-manager identity returns 200 no-direct-reports vs 403.
 * @returns {{ status: number, body: object }}
 */
function buildProjectManagerDashboard(model, options = {}) {
  const { email = null, includeIndirect = false, isPrivileged = false } = options;

  const projectId = model && typeof model === 'object' ? (model.projectId || null) : null;
  const base = { projectId, generatedAt: model?.generatedAt || null };

  // An unavailable/empty publication is represented honestly, never as a manager
  // with zero reports.
  if (!model || !['available', 'empty'].includes(model.availability)) {
    return {
      status: 200,
      body: emptyPurviewPayload({
        ...base,
        availability: model?.availability || 'unavailable',
        reason: model?.reason || 'project-roster-unavailable'
      })
    };
  }

  const accountId = resolveProjectManagerAccountId(model, email);
  if (!accountId) {
    return {
      status: 200,
      body: emptyPurviewPayload({ ...base, availability: model.availability, reason: 'no-registry-identity' })
    };
  }

  const { registry, teamsData } = buildProjectManagerModel(model);
  const managerPerson = registry.people[accountId];
  const manager = {
    accountId,
    name: managerPerson?.name || null,
    email: managerPerson?.email || null
  };

  const purview = getManagerPurview(accountId, registry, teamsData, { includeIndirect });

  if (purview.directReportUids.length === 0) {
    // Without a trusted hierarchy join, every managerRef is null — zero reports means "unknown", not "verified non-manager".
    const hierarchyAvailable = Boolean(model.enrichment) && model.enrichment.state !== 'absent';
    if (!hierarchyAvailable) {
      return {
        status: 200,
        body: emptyPurviewPayload({ ...base, manager, availability: model.availability, reason: 'hierarchy-unavailable' })
      };
    }
    if (isPrivileged) {
      return {
        status: 200,
        body: emptyPurviewPayload({ ...base, manager, availability: model.availability, reason: 'no-direct-reports' })
      };
    }
    return { status: 403, body: { error: 'You are not a manager' } };
  }

  const directReports = purview.directReportUids
    .map(uid => registry.people[uid])
    .filter(Boolean)
    .map(person => toReport(person));

  let indirectReports = [];
  if (includeIndirect && Array.isArray(purview.indirectReportUids)) {
    indirectReports = purview.indirectReportUids
      .map(uid => registry.people[uid])
      .filter(Boolean)
      .map(person => toReport(person, { indirect: true }));
  }

  const teams = purview.teams.map(team => ({
    id: team.id,
    name: team.name,
    orgKey: team.orgKey,
    orgDisplayName: projectId,
    totalMemberCount: team.totalMemberCount,
    directReportAccountIds: team.directReportUids,
    directReportCount: team.directReportUids.length
  }));

  const allOrgTeams = Object.values(teamsData.teams)
    .map(t => ({ id: t.id, name: t.name, orgKey: t.orgKey }));

  const body = emptyPurviewPayload({
    ...base,
    availability: model.availability,
    manager,
    directReports,
    teams,
    allOrgTeams,
    enrichment: model.enrichment || null,
    reason: null
  });
  if (includeIndirect) body.indirectReports = indirectReports;

  return { status: 200, body };
}

module.exports = { buildProjectManagerDashboard };
