export function epic(key, overrides = {}) {
  return {
    key,
    summary: `${key} - Bootstrap`,
    status: 'Closed',
    statusCategory: 'Done',
    resolution: null,
    priority: 'Undefined',
    assignee: null,
    components: [],
    componentSource: 'direct',
    fixVersions: ['0.4'],
    fixVersionSource: 'direct',
    labels: ['bootstrap'],
    parentFeatureKey: 'OSAC-1',
    issues: [],
    ...overrides
  }
}

function feature(key, epics) {
  return { key, summary: key, status: 'In Progress', fixVersions: ['0.4'], components: [], isContext: false, detailState: 'supported', epics }
}

const bootstrap = (...extra) => ['bootstrap', ...extra]

// Epics that qualify for at least one panel (26 distinct, 28 panel rows).
const QUALIFYING = [
  epic('OSAC-4296', { components: ['Enclave'], labels: bootstrap('ui-enclave-only'), resolution: 'Done' }),
  epic('OSAC-4345', { components: ['Enclave'], labels: bootstrap('design-approved', 'ui-enclave-only'), assignee: 'Menny Aboush' }),
  epic('OSAC-2569', { components: ['CaaS'], labels: bootstrap('be-completed') }),
  epic('OSAC-2593', { components: ['CaaS'], resolution: { name: 'Done' }, assignee: 'Elad Tabak' }),
  epic('OSAC-2633', { components: ['CaaS'], labels: bootstrap('design-approved') }),
  epic('OSAC-3539', { components: ['CaaS', 'Core'], labels: bootstrap('be-completed', 'ux-complete'), assignee: 'Ilya Skornyakov' }),
  epic('OSAC-4091', { components: ['CaaS'], assignee: 'Trey West' }),
  epic('OSAC-4520', { components: ['BMaaS'] }),
  epic('OSAC-4995', { components: ['VMaaS'], status: 'In Progress' }),
  epic('OSAC-4996', { components: ['VMaaS'], status: 'Backlog' }),
  epic('OSAC-6038', { components: ['VMaaS', 'Storage'], status: 'New' }),
  epic('OSAC-4650', { components: ['Core'] }),
  epic('OSAC-6589', { components: ['Core'] }),
  epic('OSAC-2613', { components: ['CaaS', 'Connectivity&Fabric'] }),
  epic('OSAC-2618', { components: ['VMaaS', 'Connectivity&Fabric'] }),
  epic('OSAC-4295', { components: ['Connectivity&Fabric'] }),
  epic('OSAC-4315', { components: ['Connectivity&Fabric'] }),
  epic('OSAC-5929', { components: ['Connectivity&Fabric'] }),
  epic('OSAC-6355', { components: ['Connectivity&Fabric'] }),
  epic('OSAC-4743', { components: ['Metering, Billing and Quota'] }),
  epic('OSAC-4594', { components: ['Storage'] }),
  epic('OSAC-4600', { components: ['Storage'] }),
  epic('OSAC-4606', { components: ['Storage'] }),
  epic('OSAC-5890', { components: ['Storage'] }),
  epic('OSAC-5891', { components: ['Storage'] }),
  epic('OSAC-5904', { components: ['Storage'] })
]

// Epics that must never appear in any panel.
const NON_QUALIFYING = [
  epic('OSAC-5673', { components: ['BMaaS'], componentSource: 'via-parent-feature' }),
  epic('OSAC-5145', { components: ['Core'], fixVersionSource: 'via-parent-feature' }),
  epic('OSAC-4501', { components: ['Metering, Billing and Quota'], componentSource: 'via-parent-feature', fixVersionSource: 'via-parent-feature' }),
  epic('OSAC-6127', { components: ['Core'], labels: bootstrap('no-ui'), parentFeatureKey: null }),
  epic('OSAC-6134', { components: ['Enclave'], labels: bootstrap('no-ui'), parentFeatureKey: null }),
  epic('OSAC-7001', { components: ['Storage'], resolution: 'Duplicate' }),
  epic('OSAC-7002', { components: ['Core'], labels: bootstrap('ui-enclave-only') }),
  epic('OSAC-7003', { components: ['Storage'], fixVersionSource: undefined }),
  epic('OSAC-7004', { components: ['Storage'], componentSource: undefined }),
  epic('OSAC-7005', { components: ['Storage'], labels: ['ui-work'] }),
  epic('OSAC-7006', { components: ['Storage'], fixVersions: ['0.5'] }),
  epic('MGMT-1', { components: ['Storage'] })
]

export const EXPECTED_PANEL_KEYS = {
  Enclave: ['OSAC-4296', 'OSAC-4345'],
  CaaS: ['OSAC-2569', 'OSAC-2593', 'OSAC-2633', 'OSAC-3539', 'OSAC-4091'],
  BMaaS: ['OSAC-4520'],
  VMaaS: ['OSAC-4995', 'OSAC-4996', 'OSAC-6038'],
  Core: ['OSAC-3539', 'OSAC-4650', 'OSAC-6589'],
  'Connectivity&Fabric': ['OSAC-2613', 'OSAC-2618', 'OSAC-4295', 'OSAC-4315', 'OSAC-5929', 'OSAC-6355'],
  'Metering, Billing and Quota': ['OSAC-4743'],
  Storage: ['OSAC-4594', 'OSAC-4600', 'OSAC-4606', 'OSAC-5890', 'OSAC-5891', 'OSAC-5904', 'OSAC-6038'],
  Observability: []
}

const half = Math.ceil(QUALIFYING.length / 2)

// OSAC-3539 and OSAC-4091 are repeated under a second Feature, as the store can do.
export function frozenEpicsFeatures() {
  return [
    feature('OSAC-100', QUALIFYING.slice(0, half)),
    feature('OSAC-200', [
      ...QUALIFYING.slice(half),
      QUALIFYING.find(e => e.key === 'OSAC-3539'),
      QUALIFYING.find(e => e.key === 'OSAC-4091')
    ]),
    feature('OSAC-300', NON_QUALIFYING)
  ].map(f => ({ ...f, epics: f.epics.map(e => ({ ...e })) }))
}

export function frozenEpicsResponse() {
  const features = frozenEpicsFeatures()
  return {
    version: '0.4',
    fetchedAt: '2026-10-26T10:33:00Z',
    featureCount: features.length,
    features
  }
}

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
