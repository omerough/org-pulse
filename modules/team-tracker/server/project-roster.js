/**
 * Project-qualified roster reads for People and Teams.
 *
 * Canonical person identity is (projectId, accountId); an unknown project
 * never falls back to the legacy OSAC roster. Optional fields not yet
 * published (title, manager, geo, identities) are always null, never
 * fabricated.
 */

const ARTIFACT_KEY = 'sources/roster/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function _loadProjectRosterData(projects, projectId) {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { kind: 'error', status: 400, error: 'Invalid project id' };
  }
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { kind: 'error', status: 503, error: 'Project publication reader is unavailable' };
  }

  let profile;
  try {
    profile = projects.get(projectId);
  } catch (error) {
    return { kind: 'error', status: 500, error: error.message };
  }
  if (!profile) return { kind: 'error', status: 404, error: 'Unknown project' };

  let artifact;
  try {
    artifact = projects.readArtifact(projectId, ARTIFACT_KEY);
  } catch (error) {
    return { kind: 'error', status: 502, error: error.message };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { kind: 'missing-artifact' };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { kind: 'error', status: 502, error: 'Project roster publication identity mismatch' };
  }
  if (envelope.freshness !== 'fresh') {
    return { kind: 'unavailable', reason: 'publication-not-fresh', publicationState: envelope.state, generatedAt };
  }
  if (envelope.partial === true) {
    return { kind: 'unavailable', reason: 'publication-partial', publicationState: envelope.state, generatedAt };
  }
  if (!['supported', 'empty'].includes(envelope.state)) {
    return { kind: 'unavailable', reason: 'publication-not-supported', publicationState: envelope.state, generatedAt };
  }

  const { people, teams } = envelope.data;
  if (!Array.isArray(people) || !Array.isArray(teams)) {
    return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
  }

  const seenAccountIds = new Set();
  for (const person of people) {
    if (!isRecord(person)
        || typeof person.accountId !== 'string' || !person.accountId
        || typeof person.displayName !== 'string' || !person.displayName.trim()
        || typeof person.active !== 'boolean'
        || !Array.isArray(person.teamIds)
        || person.teamIds.some(id => typeof id !== 'string' || !id)
        || new Set(person.teamIds).size !== person.teamIds.length) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    if (seenAccountIds.has(person.accountId)) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    seenAccountIds.add(person.accountId);
  }

  const seenTeamIds = new Set();
  for (const team of teams) {
    if (!isRecord(team)
        || typeof team.id !== 'string' || !team.id
        || typeof team.name !== 'string' || !team.name.trim()) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    if (seenTeamIds.has(team.id)) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
    seenTeamIds.add(team.id);
  }

  for (const person of people) {
    if (person.teamIds.some(teamId => !seenTeamIds.has(teamId))) {
      return { kind: 'error', status: 502, error: 'Invalid project roster publication' };
    }
  }

  return { kind: 'ok', envelope, generatedAt, people, teams };
}

// `key` is the normalized projectId::teamId composite key, not a team name.
function readProjectPeopleTeams(projects, projectId) {
  const loaded = _loadProjectRosterData(projects, projectId);
  if (loaded.kind === 'error') return { status: loaded.status, error: loaded.error };

  if (loaded.kind === 'missing-artifact') {
    return { status: 404, error: 'Project roster publication is unavailable' };
  }

  if (loaded.kind === 'unavailable') {
    return {
      status: 200,
      model: _unavailableReadModel(projectId, loaded.reason, loaded.publicationState, loaded.generatedAt),
    };
  }

  return { status: 200, model: _buildReadModel(projectId, loaded) };
}

function _normalizeTeam(projectId, team, memberAccountIds) {
  return {
    key: `${projectId}::${team.id}`,
    projectId,
    id: team.id,
    displayName: team.name,
    description: typeof team.description === 'string' ? team.description : null,
    state: typeof team.state === 'string' ? team.state : null,
    teamType: typeof team.teamType === 'string' ? team.teamType : null,
    memberAccountIds: [...memberAccountIds].sort()
  };
}

function _normalizePerson(projectId, person) {
  return {
    key: `${projectId}::${person.accountId}`,
    projectId,
    accountId: person.accountId,
    displayName: person.displayName.trim(),
    active: person.active,
    email: typeof person.email === 'string' && person.email.trim() ? person.email : null,
    teamIds: [...person.teamIds],
    title: null,
    manager: null,
    geo: null,
    identities: {}
  };
}

function _buildReadModel(projectId, loaded) {
  const { envelope, generatedAt, people, teams } = loaded;

  const memberAccountIdsByTeamId = new Map();
  for (const person of people) {
    if (!person.active) continue;
    for (const teamId of person.teamIds) {
      const members = memberAccountIdsByTeamId.get(teamId) || [];
      members.push(person.accountId);
      memberAccountIdsByTeamId.set(teamId, members);
    }
  }

  const normalizedTeams = teams.map(team =>
    _normalizeTeam(projectId, team, memberAccountIdsByTeamId.get(team.id) || [])
  );
  const normalizedPeople = people.map(person => _normalizePerson(projectId, person));

  const hasActiveTeamMembership = normalizedTeams.some(team => team.memberAccountIds.length > 0);

  return {
    projectId,
    availability: hasActiveTeamMembership ? 'available' : 'empty',
    reason: hasActiveTeamMembership ? null : 'no-active-team-memberships',
    publicationState: envelope.state,
    generatedAt,
    teams: normalizedTeams,
    people: normalizedPeople
  };
}

function _unavailableReadModel(projectId, reason, publicationState, generatedAt) {
  return {
    projectId,
    availability: 'unavailable',
    reason,
    publicationState,
    generatedAt,
    teams: [],
    people: []
  };
}

module.exports = { ARTIFACT_KEY, readProjectPeopleTeams };
