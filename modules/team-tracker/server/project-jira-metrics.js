/**
 * Project-qualified Jira person/team metrics reads, for Trends and Team
 * Comparison. Canonical identity is (projectId, accountId) /
 * (projectId, teamId), matching project-roster.js. GitHub/GitLab
 * contributions have no project-qualified publication yet, so trends always
 * report them as absent (`null`), never a fabricated zero.
 */

const ARTIFACT_KEY = 'sources/jira-person-metrics/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function _avgCycleTime(times) {
  if (times.length === 0) return null;
  return +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
}

// The producer always writes freshness:"fresh" on the main artifact, even for
// inapplicable/disabled/unavailable states (non-fresh values are only ever
// written to the separate _publication status sidecar, which this reader
// does not consult -- the same known gap documented for roster-enrichment).
// `state` is therefore the authoritative availability signal; `freshness` is
// a defensive secondary check in case a future producer version diverges.
function _loadProjectJiraMetricsData(projects, projectId) {
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
    return { kind: 'unavailable', reason: 'missing-publication', publicationState: null, generatedAt: null };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || (envelope.data !== null && !isRecord(envelope.data))) {
    return { kind: 'error', status: 502, error: 'Project Jira metrics publication identity mismatch' };
  }
  if (envelope.data !== null && envelope.data.projectId !== projectId) {
    return { kind: 'error', status: 502, error: 'Project Jira metrics publication identity mismatch' };
  }

  // Non-collection states (inapplicable/disabled/unavailable/error) publish
  // data:null -- these are deliberate or transient absences, not defects.
  if (!['supported', 'empty'].includes(envelope.state)) {
    return { kind: 'unavailable', reason: envelope.state, publicationState: envelope.state, generatedAt };
  }
  if (!['fresh', 'stale'].includes(envelope.freshness)) {
    return { kind: 'unavailable', reason: 'publication-not-fresh', publicationState: envelope.state, generatedAt };
  }

  const data = envelope.data;
  if (!isRecord(data) || !Array.isArray(data.people) || !Array.isArray(data.teams)) {
    return { kind: 'error', status: 502, error: 'Invalid project Jira metrics publication' };
  }

  const seenAccountIds = new Set();
  for (const person of data.people) {
    if (!isRecord(person)
        || typeof person.accountId !== 'string' || !person.accountId
        || !Array.isArray(person.teamIds)
        || !isRecord(person.resolved) || !isRecord(person.inProgress) || !isRecord(person.cycleTime)) {
      return { kind: 'error', status: 502, error: 'Invalid project Jira metrics publication' };
    }
    if (seenAccountIds.has(person.accountId)) {
      return { kind: 'error', status: 502, error: 'Invalid project Jira metrics publication' };
    }
    seenAccountIds.add(person.accountId);
  }

  const seenTeamIds = new Set();
  for (const team of data.teams) {
    if (!isRecord(team) || typeof team.id !== 'string' || !team.id || typeof team.name !== 'string') {
      return { kind: 'error', status: 502, error: 'Invalid project Jira metrics publication' };
    }
    if (seenTeamIds.has(team.id)) {
      return { kind: 'error', status: 502, error: 'Invalid project Jira metrics publication' };
    }
    seenTeamIds.add(team.id);
  }

  return {
    kind: 'ok',
    publicationState: envelope.state,
    freshness: envelope.freshness,
    partial: envelope.partial === true,
    generatedAt,
    people: data.people,
    teams: data.teams
  };
}

// Buckets each person's resolved issues by month, mirroring buildJiraTrends()'s
// shape in index.js, keyed by the project-qualified team key (`${projectId}::${teamId}`)
// so it matches the team.key the client already selects by.
function _buildTrendsModel(projectId, loaded) {
  const monthly = {};

  for (const person of loaded.people) {
    const issues = person.resolved?.issues;
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      if (!isRecord(issue) || typeof issue.resolutionDate !== 'string') continue;
      const monthKey = issue.resolutionDate.slice(0, 7);
      if (!monthly[monthKey]) monthly[monthKey] = { resolved: 0, points: 0, cycleTimes: [], byTeam: {} };
      const bucket = monthly[monthKey];
      const points = typeof issue.storyPoints === 'number' ? issue.storyPoints : 0;
      const hasCycleTime = typeof issue.cycleTimeDays === 'number' && issue.cycleTimeDays >= 0;

      bucket.resolved++;
      bucket.points += points;
      if (hasCycleTime) bucket.cycleTimes.push(issue.cycleTimeDays);

      for (const teamId of person.teamIds) {
        if (!bucket.byTeam[teamId]) bucket.byTeam[teamId] = { resolved: 0, points: 0, cycleTimes: [] };
        bucket.byTeam[teamId].resolved++;
        bucket.byTeam[teamId].points += points;
        if (hasCycleTime) bucket.byTeam[teamId].cycleTimes.push(issue.cycleTimeDays);
      }
    }
  }

  const jira = {};
  for (const [month, bucket] of Object.entries(monthly)) {
    const byTeam = {};
    for (const [teamId, teamBucket] of Object.entries(bucket.byTeam)) {
      byTeam[`${projectId}::${teamId}`] = {
        resolved: teamBucket.resolved,
        points: teamBucket.points,
        avgCycleTimeDays: _avgCycleTime(teamBucket.cycleTimes)
      };
    }
    jira[month] = {
      resolved: bucket.resolved,
      points: bucket.points,
      avgCycleTimeDays: _avgCycleTime(bucket.cycleTimes),
      byTeam
    };
  }

  return {
    projectId,
    availability: loaded.people.length > 0 ? 'available' : 'empty',
    reason: loaded.people.length > 0 ? null : 'no-published-people',
    publicationState: loaded.publicationState,
    partial: loaded.partial,
    generatedAt: loaded.generatedAt,
    jira,
    // No project-qualified GitHub/GitLab contribution publication exists yet.
    github: null,
    gitlab: null
  };
}

function _unavailableTrendsModel(projectId, loaded) {
  return {
    projectId,
    availability: 'unavailable',
    reason: loaded.reason,
    publicationState: loaded.publicationState,
    generatedAt: loaded.generatedAt,
    jira: null,
    github: null,
    gitlab: null
  };
}

function readProjectTrends(projects, projectId) {
  const loaded = _loadProjectJiraMetricsData(projects, projectId);
  if (loaded.kind === 'error') return { status: loaded.status, error: loaded.error };
  if (loaded.kind === 'unavailable') return { status: 200, model: _unavailableTrendsModel(projectId, loaded) };
  return { status: 200, model: _buildTrendsModel(projectId, loaded) };
}

function _buildTeamMetricsModel(projectId, team) {
  return {
    teamKey: `${projectId}::${team.id}`,
    available: true,
    memberCount: typeof team.memberCount === 'number' ? team.memberCount : 0,
    aggregate: {
      resolvedCount: team.resolved?.count ?? 0,
      resolvedPoints: team.resolved?.storyPoints ?? 0,
      inProgressCount: team.inProgress?.count ?? 0,
      avgCycleTimeDays: team.cycleTime?.avgDays ?? null
    },
    partial: team.partial === true
  };
}

function _unavailableTeamMetricsModel(projectId, teamId, loaded) {
  return {
    teamKey: `${projectId}::${teamId}`,
    available: false,
    reason: loaded.reason,
    publicationState: loaded.publicationState,
    generatedAt: loaded.generatedAt,
    partial: false
  };
}

function readProjectTeamMetrics(projects, projectId, teamId) {
  const loaded = _loadProjectJiraMetricsData(projects, projectId);
  if (loaded.kind === 'error') return { status: loaded.status, error: loaded.error };
  if (loaded.kind === 'unavailable') return { status: 200, model: _unavailableTeamMetricsModel(projectId, teamId, loaded) };

  const team = loaded.teams.find(t => t.id === teamId);
  if (!team) return { status: 404, error: `Team "${teamId}" not found in project Jira metrics publication` };
  return { status: 200, model: _buildTeamMetricsModel(projectId, team) };
}

module.exports = { ARTIFACT_KEY, readProjectTrends, readProjectTeamMetrics };
