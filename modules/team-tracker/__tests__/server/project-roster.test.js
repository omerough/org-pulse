/**
 * Project-qualified People and Teams roster reads: an unknown project never
 * falls back to the legacy OSAC roster file; unavailable publications stay
 * truthful.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readProjectPeopleTeams } from '../../server/project-roster.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeProfile(projectId) {
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function makeRosterEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: 'sources/roster/registry.json',
    source: { id: `${projectId}-roster`, kind: 'atlassian-teams' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-09-28T00:00:00Z',
    data: {
      projectId,
      teams: [
        { id: 'team-1', name: 'RHEM-QE', orgKey: projectId },
        { id: 'team-2', name: 'RHEM-DEV', orgKey: projectId }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1', 'team-2'] },
        { accountId: 'acct-2', displayName: 'Bob', active: false, teamIds: ['team-2'] }
      ],
      ...overrides
    }
  }
}

describe('readProjectPeopleTeams', () => {
  let publications;
  let profiles;

  beforeEach(() => {
    publications = {
      flightctl: { 'sources/roster/registry.json': { value: makeRosterEnvelope('flightctl') } }
    };
    profiles = { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') };
  });

  it('keys people and teams by (projectId, id) and keeps a stable shape', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.projectId).toBe('flightctl');
    expect(result.model.teams).toEqual([
      {
        key: 'flightctl::team-1',
        projectId: 'flightctl',
        id: 'team-1',
        displayName: 'RHEM-QE',
        description: null,
        state: null,
        teamType: null,
        memberAccountIds: ['acct-1']
      },
      {
        key: 'flightctl::team-2',
        projectId: 'flightctl',
        id: 'team-2',
        displayName: 'RHEM-DEV',
        description: null,
        state: null,
        teamType: null,
        // acct-2 is inactive and must not appear in team membership.
        memberAccountIds: ['acct-1']
      }
    ]);
    expect(result.model.people).toEqual([
      {
        key: 'flightctl::acct-1',
        projectId: 'flightctl',
        accountId: 'acct-1',
        displayName: 'Alice',
        active: true,
        email: null,
        teamIds: ['team-1', 'team-2'],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      },
      {
        key: 'flightctl::acct-2',
        projectId: 'flightctl',
        accountId: 'acct-2',
        displayName: 'Bob',
        active: false,
        email: null,
        teamIds: ['team-2'],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]);
  });

  it('propagates email when the publication includes one', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, email: 'alice@example.com', teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.people[0].email).toBe('alice@example.com');
  });

  it('keeps a missing email as null, not absent', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const [person] = result.model.people;
    expect('email' in person).toBe(true);
    expect(person.email).toBeNull();
  });

  it('surfaces already-published team metadata without fabricating missing fields', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'RHEM-QE', orgKey: 'flightctl', description: 'Quality', state: 'ACTIVE', teamType: 'open' },
        { id: 'team-2', name: 'RHEM-DEV', orgKey: 'flightctl' }
      ],
      people: []
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const [qe, dev] = result.model.teams;
    expect(qe).toMatchObject({ description: 'Quality', state: 'ACTIVE', teamType: 'open' });
    expect(dev).toMatchObject({ description: null, state: null, teamType: null });
  });

  it('is empty when every published person is inactive', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: false, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('empty');
    expect(result.model.reason).toBe('no-active-team-memberships');
    // Inactive people still appear in the people collection.
    expect(result.model.people).toHaveLength(1);
    expect(result.model.teams[0].memberAccountIds).toEqual([]);
  });

  it('is empty when the only active person has no team assignment', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: [] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('empty');
    expect(result.model.reason).toBe('no-active-team-memberships');
  });

  it('is available when at least one active person belongs to a team', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-2', displayName: 'Bob', active: false, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('available');
    expect(result.model.reason).toBeNull();
    expect(result.model.teams[0].memberAccountIds).toEqual(['acct-1']);
  });

  it('represents a stale publication as unavailable with the same stable shape', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl');
    publications.flightctl['sources/roster/registry.json'].value.freshness = 'stale';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model).toEqual({
      projectId: 'flightctl',
      availability: 'unavailable',
      reason: 'publication-not-fresh',
      publicationState: 'supported',
      generatedAt: '2026-09-28T00:00:00Z',
      teams: [],
      people: []
    });
  });

  it('represents a partial publication as unavailable', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl');
    publications.flightctl['sources/roster/registry.json'].value.partial = true;
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('unavailable');
    expect(result.model.reason).toBe('publication-partial');
  });

  it('accepts two distinct team IDs that share the same team name', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'Platform', orgKey: 'flightctl' },
        { id: 'team-2', name: 'Platform', orgKey: 'flightctl' }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-2', displayName: 'Bob', active: true, teamIds: ['team-2'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.teams.map(t => t.key)).toEqual(['flightctl::team-1', 'flightctl::team-2']);
    expect(result.model.teams.every(t => t.displayName === 'Platform')).toBe(true);
  });

  it('rejects duplicate team IDs', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'Platform', orgKey: 'flightctl' },
        { id: 'team-1', name: 'Platform Again', orgKey: 'flightctl' }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
  });

  it('rejects duplicate accounts', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-1', displayName: 'Alice again', active: true, teamIds: ['team-2'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
  });

  it('rejects an unknown project', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'nonexistent');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Unknown project');
  });

  it('rejects a malformed project id', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), '');
    expect(result.status).toBe(400);
  });

  it('never returns another project data for the requested projectId', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('osac');
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
    expect(result.error).toBe('Project roster publication identity mismatch');
  });

  it('does not fall back to the legacy OSAC roster when a project publication is missing', () => {
    const result = readProjectPeopleTeams(mockProjects({}, profiles), 'osac');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Project roster publication is unavailable');
  });
});
