// Shape of the OSAC registry on 2026-10-26 (GA dates only; other fields trimmed).
export const OSAC_REGISTRY_RELEASES = [
  { id: 'osac-0.2-m1', displayName: 'OSAC 0.2 M1', fixVersions: ['0.2-M1'], state: 'active', milestones: { ga: '2026-06-30' } },
  { id: 'osac-0.2-m2', displayName: 'OSAC 0.2 M2', fixVersions: ['0.2-M2'], state: 'active', milestones: { ga: '2026-07-31' } },
  { id: 'osac-0.3', displayName: 'OSAC 0.3', fixVersions: ['0.3'], state: 'active', milestones: { ga: '2026-09-30' } },
  { id: 'osac-0.4', displayName: 'OSAC 0.4', fixVersions: ['0.4'], state: 'active', milestones: { ga: '2026-10-30' } },
  { id: 'osac-0.5', displayName: 'OSAC 0.5', fixVersions: ['0.5'], state: 'active', milestones: { ga: '2026-11-30' } },
  { id: 'osac-0.6', displayName: 'OSAC 0.6', fixVersions: ['0.6'], state: 'active', milestones: { ga: '2026-12-31' } },
  { id: 'osac-backlog', displayName: 'Backlog', fixVersions: ['Backlog'], state: 'active', milestones: {} }
]

export const OSAC_AVAILABLE_VERSIONS = ['0.0', '0.2-M1', '0.2-M2', '0.3', '0.4', '0.5', '0.6', 'Backlog']
