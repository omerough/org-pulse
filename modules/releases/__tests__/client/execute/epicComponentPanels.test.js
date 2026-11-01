import { describe, it, expect } from 'vitest'
import { resolveComponentDashboard } from '../../../client/execute/utils/componentDashboardConfig'
import {
  matchesPanel,
  collectEpics,
  collectLabelOptions,
  buildComponentPanels,
  sortEpics
} from '../../../client/execute/utils/epicComponentPanels'
import { epic, frozenEpicsFeatures, EXPECTED_PANEL_KEYS } from './uiEpicsFixture'

const { config } = resolveComponentDashboard('osac')
const panelFor = component => config.panels.find(p => p.component === component)
const keysOf = panel => panel.rows.map(r => r.epic.key)
const asFeatures = (...epics) => [{ epics }]

describe('resolveComponentDashboard', () => {
  it('resolves a configured project and the empty single-project id', () => {
    expect(resolveComponentDashboard('osac').projectId).toBe('osac')
    expect(resolveComponentDashboard('').projectId).toBe('osac')
    expect(resolveComponentDashboard(null).projectId).toBe('osac')
  })

  it('returns null for unconfigured or prototype-shaped project ids', () => {
    expect(resolveComponentDashboard('flightctl')).toBeNull()
    expect(resolveComponentDashboard('constructor')).toBeNull()
    expect(resolveComponentDashboard('toString')).toBeNull()
  })
})

describe('frozen 0.4 parity fixture', () => {
  const result = buildComponentPanels(frozenEpicsFeatures(), config, '0.4')

  it('places every Epic in exactly the expected panels, in dashboard order', () => {
    expect(result.panels.map(p => p.component)).toEqual(Object.keys(EXPECTED_PANEL_KEYS))
    for (const panel of result.panels) {
      expect([...keysOf(panel)].sort()).toEqual([...EXPECTED_PANEL_KEYS[panel.component]].sort())
    }
  })

  it('counts 28 rows over 26 distinct Epics and leaves Observability empty', () => {
    expect(result.rowCount).toBe(28)
    expect(result.distinctEpicCount).toBe(26)
    expect(result.panels.find(p => p.component === 'Observability').rows).toEqual([])
  })

  it('lists multi-panel Epics once per panel with an also-in pointer', () => {
    const row = (component, key) => result.panels.find(p => p.component === component).rows.find(r => r.epic.key === key)
    expect(row('CaaS', 'OSAC-3539').alsoIn).toEqual(['Core'])
    expect(row('Core', 'OSAC-3539').alsoIn).toEqual(['CaaS'])
    expect(row('VMaaS', 'OSAC-6038').alsoIn).toEqual(['Storage'])
    expect(row('Storage', 'OSAC-6038').alsoIn).toEqual(['VMaaS'])
    expect(row('Core', 'OSAC-4650').alsoIn).toEqual([])
  })

  it('never lists inherited-only, no-ui, duplicate-resolution, unprovenanced or non-project Epics', () => {
    const listed = new Set(result.panels.flatMap(keysOf))
    const excluded = ['OSAC-5673', 'OSAC-5145', 'OSAC-4501', 'OSAC-6127', 'OSAC-6134', 'OSAC-7001',
      'OSAC-7002', 'OSAC-7003', 'OSAC-7004', 'OSAC-7005', 'OSAC-7006', 'MGMT-1']
    for (const key of excluded) expect(listed.has(key)).toBe(false)
  })

  it('keeps the Connectivity&Fabric cross-exclusion', () => {
    expect(keysOf(result.panels.find(p => p.component === 'CaaS'))).not.toContain('OSAC-2613')
    expect(keysOf(result.panels.find(p => p.component === 'VMaaS'))).not.toContain('OSAC-2618')
  })
})

describe('matchesPanel', () => {
  const enclave = panelFor('Enclave')
  const caas = panelFor('CaaS')
  const base = epic('OSAC-1', { components: ['Enclave', 'CaaS'], labels: ['bootstrap', 'ui-enclave-only'] })

  it('routes ui-enclave-only to Enclave only and no-ui nowhere', () => {
    expect(matchesPanel(base, enclave, config, '0.4')).toBe(true)
    expect(matchesPanel(base, caas, config, '0.4')).toBe(false)
    const noUi = epic('OSAC-2', { components: ['Enclave', 'CaaS'], labels: ['bootstrap', 'no-ui'] })
    for (const panel of config.panels) expect(matchesPanel(noUi, panel, config, '0.4')).toBe(false)
  })

  it('requires the bootstrap label', () => {
    expect(matchesPanel(epic('OSAC-3', { components: ['Enclave'], labels: [] }), enclave, config, '0.4')).toBe(false)
  })

  it('matches labels and components case-insensitively', () => {
    expect(matchesPanel(epic('OSAC-4', { components: ['enclave'], labels: ['Bootstrap'] }), enclave, config, '0.4')).toBe(true)
    expect(matchesPanel(epic('OSAC-5', { components: ['Enclave'], labels: ['BOOTSTRAP', 'No-UI'] }), enclave, config, '0.4')).toBe(false)
  })

  it('strips the z-stream suffix on both sides of the version comparison', () => {
    const e = epic('OSAC-6', { components: ['Enclave'], fixVersions: ['0.4.z'] })
    expect(matchesPanel(e, enclave, config, '0.4')).toBe(true)
    expect(matchesPanel(epic('OSAC-7', { components: ['Enclave'] }), enclave, config, '0.4.z')).toBe(true)
    expect(matchesPanel(e, enclave, config, '0.5')).toBe(false)
  })

  it('requires direct provenance for Fix Version and Component; missing counts as inherited', () => {
    expect(matchesPanel(epic('OSAC-8', { components: ['Enclave'], componentSource: 'via-parent-feature' }), enclave, config, '0.4')).toBe(false)
    expect(matchesPanel(epic('OSAC-9', { components: ['Enclave'], fixVersionSource: undefined }), enclave, config, '0.4')).toBe(false)
  })

  it('excludes Duplicate resolution (string or object) and passes null, empty and other resolutions', () => {
    const withResolution = resolution => matchesPanel(epic('OSAC-10', { components: ['Enclave'], resolution }), enclave, config, '0.4')
    expect(withResolution('Duplicate')).toBe(false)
    expect(withResolution({ name: 'duplicate' })).toBe(false)
    expect(withResolution(null)).toBe(true)
    expect(withResolution(undefined)).toBe(true)
    expect(withResolution('')).toBe(true)
    expect(withResolution('Done')).toBe(true)
    expect(withResolution({ name: 'Done' })).toBe(true)
  })

  it('requires the Epic key to belong to the configured Jira project', () => {
    expect(matchesPanel(epic('MGMT-1', { components: ['Enclave'] }), enclave, config, '0.4')).toBe(false)
    expect(matchesPanel(epic('osac-11', { components: ['Enclave'] }), enclave, config, '0.4')).toBe(true)
    expect(matchesPanel(epic('nokey', { components: ['Enclave'] }), enclave, config, '0.4')).toBe(false)
  })

  it('never matches without a release', () => {
    expect(matchesPanel(base, enclave, config, '')).toBe(false)
  })
})

describe('duplicate Epic handling', () => {
  it('keeps one object per key across Features, first occurrence wins', () => {
    const first = epic('OSAC-1', { components: ['Core'], summary: 'first' })
    const second = epic('OSAC-1', { components: ['Core'], summary: 'second' })
    const epics = collectEpics([{ epics: [first] }, { epics: [second, epic('OSAC-2', { summary: 'other' })] }])
    expect(epics.map(e => e.summary)).toEqual(['first', 'other'])
  })

  it('treats keys differing only by case or whitespace as the same Epic', () => {
    expect(collectEpics(asFeatures(epic('OSAC-1'), epic(' osac-1 '))).length).toBe(1)
  })

  it('skips Epics without a key', () => {
    expect(collectEpics(asFeatures(epic(undefined), epic(''), null))).toEqual([])
  })

  it('shows a repeated Epic once per panel and counts it once in the summary', () => {
    const e = epic('OSAC-1', { components: ['Core'] })
    const result = buildComponentPanels([{ epics: [e] }, { epics: [{ ...e }] }], config, '0.4')
    expect(keysOf(result.panels.find(p => p.component === 'Core'))).toEqual(['OSAC-1'])
    expect(result.rowCount).toBe(1)
    expect(result.distinctEpicCount).toBe(1)
  })

  it('evaluates only the first occurrence when duplicate rows disagree', () => {
    const inherited = epic('OSAC-1', { components: ['Core'], componentSource: 'via-parent-feature' })
    const direct = epic('OSAC-1', { components: ['Core'] })
    const result = buildComponentPanels([{ epics: [inherited] }, { epics: [direct] }], config, '0.4')
    expect(result.rowCount).toBe(0)
  })
})

describe('sorting', () => {
  it('orders by status, then priority, then key, with unlisted values last', () => {
    const sorted = sortEpics([
      epic('OSAC-10', { status: 'New' }),
      epic('OSAC-2', { status: 'Backlog' }),
      epic('OSAC-3', { status: 'In Progress', priority: 'Minor' }),
      epic('OSAC-4', { status: 'In Progress', priority: 'Blocker' }),
      epic('OSAC-5', { status: 'Closed' }),
      epic('OSAC-1', { status: 'In Progress', priority: 'Minor' }),
      epic('OSAC-6', { status: 'Verified' }),
      epic('OSAC-7', { status: 'Abandoned' })
    ], config)
    expect(sorted.map(e => e.key)).toEqual(
      ['OSAC-5', 'OSAC-4', 'OSAC-1', 'OSAC-3', 'OSAC-2', 'OSAC-10', 'OSAC-7', 'OSAC-6']
    )
  })

  it('compares key numbers numerically and treats a missing priority as Undefined', () => {
    const sorted = sortEpics([
      epic('OSAC-100', { priority: 'Undefined' }),
      epic('OSAC-20', { priority: undefined }),
      epic('OSAC-30', { priority: 'Normal' })
    ], config)
    expect(sorted.map(e => e.key)).toEqual(['OSAC-30', 'OSAC-20', 'OSAC-100'])
  })

  it('does not mutate its input', () => {
    const input = [epic('OSAC-2'), epic('OSAC-1')]
    sortEpics(input, config)
    expect(input.map(e => e.key)).toEqual(['OSAC-2', 'OSAC-1'])
  })
})

describe('filters', () => {
  const features = frozenEpicsFeatures()
  const full = buildComponentPanels(features, config, '0.4')
  const panelOf = (result, component) => result.panels.find(p => p.component === component)

  it('narrow rows without changing membership or options', () => {
    const filtered = buildComponentPanels(features, config, '0.4', { statuses: ['In Progress'] })
    expect(keysOf(panelOf(filtered, 'VMaaS'))).toEqual(['OSAC-4995'])
    expect(panelOf(filtered, 'VMaaS').memberCount).toBe(3)
    expect(filtered.options).toEqual(full.options)
  })

  it('keeps also-in pointers when filters hide the other panel', () => {
    const filtered = buildComponentPanels(features, config, '0.4', { components: ['CaaS'] })
    expect(panelOf(filtered, 'CaaS').rows.find(r => r.epic.key === 'OSAC-3539').alsoIn).toEqual(['Core'])
  })

  it('hides whole panels by component and recounts the summary', () => {
    const filtered = buildComponentPanels(features, config, '0.4', { components: ['core', 'Storage'] })
    expect(filtered.panels.map(p => p.component)).toEqual(['Core', 'Storage'])
    expect(filtered.rowCount).toBe(10)
    expect(filtered.distinctEpicCount).toBe(10)
  })

  it('filters by assignee including the unassigned sentinel', () => {
    const named = buildComponentPanels(features, config, '0.4', { assignees: ['Trey West'] })
    expect(named.rowCount).toBe(1)
    expect(named.options.assignees).toContain('__unassigned__')
    const unassigned = buildComponentPanels(features, config, '0.4', { assignees: ['__unassigned__'] })
    expect(unassigned.rowCount).toBe(full.rowCount - 5)
  })

  it('filters by raw labels with OR semantics, case-insensitively', () => {
    const one = buildComponentPanels(features, config, '0.4', { labels: ['ux-complete'] })
    expect(one.panels.flatMap(keysOf)).toEqual(['OSAC-3539', 'OSAC-3539'])
    const either = buildComponentPanels(features, config, '0.4', { labels: ['UX-COMPLETE', 'design-approved'] })
    expect(new Set(either.panels.flatMap(keysOf))).toEqual(new Set(['OSAC-3539', 'OSAC-2633', 'OSAC-4345']))
  })

  it('collects raw Epic labels sorted case-insensitively, ignoring blanks', () => {
    const options = collectLabelOptions([
      epic('A-1', { labels: ['zeta', 'Alpha', ' ', 'alpha2'] }),
      epic('A-2', { labels: ['Alpha', null] })
    ])
    expect(options).toEqual(['Alpha', 'alpha2', 'zeta'])
    expect(full.options.labels).toEqual(['be-completed', 'bootstrap', 'design-approved', 'ui-enclave-only', 'ux-complete'])
  })

  it('offers the configured components and only member statuses', () => {
    expect(full.options.components).toEqual(Object.keys(EXPECTED_PANEL_KEYS))
    expect(full.options.statuses).toEqual(['Backlog', 'Closed', 'In Progress', 'New'])
  })
})
