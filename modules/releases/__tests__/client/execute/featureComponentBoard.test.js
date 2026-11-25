import { describe, it, expect } from 'vitest'
import { resolveComponentDashboard } from '../../../client/execute/utils/componentDashboardConfig'
import {
  analyzeFeatures, buildFeatureBoard, releasesOf, resolveReleaseOption, UNSCHEDULED, OTHER_REASONS
} from '../../../client/execute/utils/featureComponentBoard'

const CONFIG = resolveComponentDashboard('osac').config

function source(epicKey, overrides = {}) {
  return {
    epicKey, epicType: 'uix', fixVersions: [], components: [], localStatus: 'unknown',
    stageLabels: [], routingLabels: [], status: 'In Progress', assignee: 'Epic Owner',
    priority: 'Major', resolution: null, ...overrides
  }
}

function evidence(status, sources, extra = {}) {
  return { status, conflict: false, scopes: [], sources, ...extra }
}

// UX and UI evidence both draw on the same `sources` unless a workstream is given explicitly.
function feature(key, { sources = [source(`${key}-E1`)], ui, ux, ...overrides } = {}) {
  return {
    key, summary: `${key} summary`, status: 'In Progress', resolution: null, priority: 'Normal',
    assignee: 'Feature Owner', fixVersions: ['0.5'], components: ['Core'], labels: [],
    uiEvidence: ui || evidence('in-progress', sources),
    uxEvidence: ux || evidence('in-progress', sources),
    ...overrides
  }
}

function board(features, release = '0.5', filters = {}, profile = null) {
  const analysis = analyzeFeatures(features, CONFIG, profile)
  return { analysis, result: buildFeatureBoard(analysis, CONFIG, release, filters) }
}

const panelKeys = (result, component) => result.panels.find(p => p.component === component).cards.map(c => c.key)

describe('releasesOf', () => {
  it('strips .z, folds case, keeps one entry per release and one card per version', () => {
    expect(releasesOf({ fixVersions: ['0.5.z', '0.5', '0.6'] })).toEqual(['0.5', '0.6'])
    expect(releasesOf({ fixVersions: ['Backlog', 'backlog'] })).toEqual(['Backlog'])
  })

  it('ignores non-string and non-array Fix Version values', () => {
    expect(releasesOf({ fixVersions: [null, 5, {}, '0.5'] })).toEqual(['0.5'])
    expect(releasesOf({ fixVersions: '0.5' })).toEqual([UNSCHEDULED])
  })

  it('places a Feature with no own Fix Version in Unscheduled', () => {
    expect(releasesOf({ fixVersions: [] })).toEqual([UNSCHEDULED])
    expect(releasesOf({})).toEqual([UNSCHEDULED])
  })
})

describe('placement', () => {
  it('uses the Feature Fix Version only: Epic releases and epicReleaseVersions never place it', () => {
    const moved = feature('F-1', {
      fixVersions: ['0.5'],
      epicReleaseVersions: ['0.4'],
      sources: [source('E-1', { fixVersions: ['0.4'], components: ['Core'] })]
    })
    const unscheduled = feature('F-2', {
      fixVersions: [],
      epicReleaseVersions: ['0.4'],
      sources: [source('E-2', { fixVersions: ['0.4'] })]
    })

    const { analysis } = board([moved, unscheduled])
    expect(panelKeys(buildFeatureBoard(analysis, CONFIG, '0.4'), 'Core')).toEqual([])
    expect(panelKeys(buildFeatureBoard(analysis, CONFIG, '0.5'), 'Core')).toEqual(['F-1'])
    expect(panelKeys(buildFeatureBoard(analysis, CONFIG, UNSCHEDULED), 'Core')).toEqual(['F-2'])
    expect(analysis.releaseOptions).toEqual(['0.5', UNSCHEDULED])
  })

  it('yields one card per Fix Version of a multi-version Feature', () => {
    const multi = feature('F-1', { fixVersions: ['0.5', '0.6.z'] })
    const { analysis } = board([multi])
    expect(panelKeys(buildFeatureBoard(analysis, CONFIG, '0.5'), 'Core')).toEqual(['F-1'])
    expect(panelKeys(buildFeatureBoard(analysis, CONFIG, '0.6'), 'Core')).toEqual(['F-1'])
  })

  it('sorts release options numerically with Unscheduled last', () => {
    const { analysis } = board([
      feature('F-1', { fixVersions: ['0.10'] }), feature('F-2', { fixVersions: ['0.9'] }),
      feature('F-3', { fixVersions: [] }), feature('F-4', { fixVersions: ['Backlog'] })
    ])
    expect(analysis.releaseOptions).toEqual(['0.9', '0.10', 'Backlog', UNSCHEDULED])
  })
})

describe('release options', () => {
  it('include releases whose Features are all excluded, and the board shows their Not shown list', () => {
    const features = [
      feature('F-1', { fixVersions: ['0.5'] }),
      feature('F-2', { fixVersions: ['0.4'], resolution: 'Obsolete' }),
      feature('F-3', { fixVersions: ['0.3'], ui: evidence('not-applicable', [source('E-3')]) })
    ]
    const { analysis, result } = board(features, '0.4')
    expect(analysis.releaseOptions).toEqual(['0.3', '0.4', '0.5'])
    expect(analysis.releasesWithCards).toEqual(['0.5'])
    expect(result.rowCount).toBe(0)
    expect(result.notShown.map(e => e.key)).toEqual(['F-2'])
  })
})

describe('resolveReleaseOption', () => {
  const options = ['0.5', 'Backlog', UNSCHEDULED]

  it('matches under the same folding that places Features', () => {
    expect(resolveReleaseOption(options, '0.5.Z')).toBe('0.5')
    expect(resolveReleaseOption(options, ' backlog ')).toBe('Backlog')
    expect(resolveReleaseOption(options, 'unscheduled')).toBe(UNSCHEDULED)
  })

  it('returns null for non-string requests', () => {
    for (const value of [5, {}, ['0.5'], true, Object.create(null)]) {
      expect(resolveReleaseOption(options, value)).toBeNull()
    }
  })

  it('returns null for blank or unknown requests', () => {
    expect(resolveReleaseOption(options, '9.9')).toBeNull()
    expect(resolveReleaseOption(options, '')).toBeNull()
    expect(resolveReleaseOption(options, undefined)).toBeNull()
  })
})

describe('source merging', () => {
  it('keeps Epic metadata defined on either workstream entry and unions its lists', () => {
    const uiEntry = source('E-1', { epicType: 'bootstrap', status: undefined, assignee: undefined, fixVersions: ['0.5'], components: ['Core'] })
    const uxEntry = source('E-1', { status: 'Closed', assignee: 'Ada', fixVersions: ['0.5', '0.6'], components: ['Storage'] })
    const { analysis } = board([feature('F-1', {
      ui: evidence('in-progress', [uiEntry]), ux: evidence('in-progress', [uxEntry])
    })])
    const [merged] = analysis.cards[0].sources
    expect(merged).toMatchObject({
      epicType: 'bootstrap', status: 'Closed', assignee: 'Ada', fixVersions: ['0.5', '0.6'], components: ['Core', 'Storage']
    })
  })

  it('keeps an explicit null rather than replacing it from the other entry', () => {
    const uiEntry = source('E-1', { assignee: null })
    const uxEntry = source('E-1', { assignee: 'Ada' })
    const { analysis } = board([feature('F-1', {
      ui: evidence('in-progress', [uiEntry]), ux: evidence('in-progress', [uxEntry])
    })])
    expect(analysis.cards[0].sources[0].assignee).toBeNull()
  })
})

describe('eligibility', () => {
  it('excludes configured non-delivery resolutions and lists them as not shown', () => {
    const features = [
      feature('F-1', { resolution: "Won't Do", status: 'Closed' }),
      feature('F-2', { resolution: 'Declined', status: 'Closed' }),
      feature('F-3', { resolution: 'Done', status: 'Closed' })
    ]
    const { result } = board(features)
    expect(panelKeys(result, 'Core')).toEqual(['F-3'])
    expect(result.notShown.map(e => [e.key, e.reason, e.resolution])).toEqual([
      ['F-1', 'non-delivery', "Won't Do"], ['F-2', 'non-delivery', 'Declined']
    ])
  })

  it('prefers the project terminal-outcome profile over the config list', () => {
    const features = [feature('F-1', { resolution: 'Declined' }), feature('F-2', { resolution: 'Rejected' })]
    const { result } = board(features, '0.5', {}, { completed: ['Done'], nonDelivery: ['Rejected'] })
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
    expect(result.notShown.map(e => e.key)).toEqual(['F-2'])
  })

  it('treats Closed/Done Features without a non-delivery resolution as delivered work', () => {
    const { result } = board([feature('F-1', { status: 'Closed', resolution: null })])
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
  })

  it('excludes a Feature whose published UI evidence is not-applicable and lists it as no-ui', () => {
    const noUi = feature('F-1', { ui: evidence('not-applicable', [source('E-1')]) })
    const { result } = board([noUi])
    expect(panelKeys(result, 'Core')).toEqual([])
    expect(result.notShown.map(e => [e.key, e.reason])).toEqual([['F-1', 'no-ui']])
  })

  it('keeps non-delivery as the reason when a Feature is both non-delivery and no-ui', () => {
    const f = feature('F-1', { resolution: 'Obsolete', ui: evidence('not-applicable', [source('E-1')]) })
    expect(board([f]).result.notShown.map(e => e.reason)).toEqual(['non-delivery'])
  })

  it('excludes a Feature whose only source Epics are no-work, and lists it', () => {
    const f = feature('F-1', { sources: [source('E-1', { resolution: 'Obsolete' }), source('E-2', { resolution: "Won't Do" })] })
    const { result } = board([f])
    expect(panelKeys(result, 'Core')).toEqual([])
    expect(result.notShown.map(e => [e.key, e.reason])).toEqual([['F-1', 'no-live-source']])
  })

  it('treats sources without a resolution field (older payload) as live', () => {
    const legacySource = source('E-1')
    delete legacySource.resolution
    const { result } = board([feature('F-1', { sources: [legacySource] })])
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
  })

  it('ignores Features without any UI/UX source Epic', () => {
    const { analysis, result } = board([feature('F-1', { sources: [], labels: ['osac-ui'] })])
    expect(analysis.cards).toEqual([])
    expect(result.notShown).toEqual([])
  })

  it('scopes the not-shown list to the selected release', () => {
    const { analysis } = board([feature('F-1', { resolution: 'Duplicate', fixVersions: ['0.4'] })])
    expect(buildFeatureBoard(analysis, CONFIG, '0.4').notShown.map(e => e.key)).toEqual(['F-1'])
    expect(buildFeatureBoard(analysis, CONFIG, '0.5').notShown).toEqual([])
  })
})

describe('rollup presentation', () => {
  it('passes the published UX and UI statuses through unchanged', () => {
    const f = feature('F-1', {
      sources: [source('E-1', { localStatus: 'design' })],
      ui: evidence('not-started', [source('E-1', { localStatus: 'design' })]),
      ux: { ...evidence('in-progress', [source('E-1', { localStatus: 'design' })]), conflict: true }
    })
    const [card] = board([f]).result.panels.find(p => p.component === 'Core').cards
    expect(card.ui).toEqual({ status: 'not-started', conflict: false })
    expect(card.ux).toEqual({ status: 'in-progress', conflict: true })
  })

  it('merges a source shared by both workstreams and keeps each workstream\'s local status', () => {
    const f = feature('F-1', {
      ui: evidence('not-started', [source('E-1', { localStatus: 'not-started' })]),
      ux: evidence('in-progress', [source('E-1', { localStatus: 'in-progress' })])
    })
    const [card] = board([f]).result.panels.find(p => p.component === 'Core').cards
    expect(card.sources).toHaveLength(1)
    expect(card.sources[0]).toMatchObject({ epicKey: 'E-1', ui: 'not-started', ux: 'in-progress' })
  })

  it('keeps no-work source Epics in the source list, flagged, while live ones feed panel routing', () => {
    const f = feature('F-1', {
      components: [],
      sources: [
        source('E-LIVE', { components: ['Storage'] }),
        source('E-DEAD', { components: ['Observability'], resolution: 'Duplicate' })
      ]
    })
    const { result } = board([f])
    expect(panelKeys(result, 'Storage')).toEqual(['F-1'])
    expect(panelKeys(result, 'Observability')).toEqual([])
    const [card] = result.panels.find(p => p.component === 'Storage').cards
    expect(card.sources.map(s => [s.epicKey, s.noWork])).toEqual([['E-DEAD', true], ['E-LIVE', false]])
  })
})

describe('panel routing', () => {
  it('places a Feature in every panel named by its Components or its live source Epics, with alsoIn', () => {
    const f = feature('F-1', {
      components: ['Core'],
      sources: [source('E-1', { components: ['Storage'] })]
    })
    const { result } = board([f])
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
    expect(panelKeys(result, 'Storage')).toEqual(['F-1'])
    const [core] = result.panels.find(p => p.component === 'Core').cards
    expect(core.alsoIn).toEqual(['Storage'])
  })

  it('applies notInComponents to the Feature\'s own Components only', () => {
    const featureLevel = feature('F-1', {
      components: ['CaaS', 'Connectivity&Fabric'], sources: [source('E-1')]
    })
    const epicLevel = feature('F-2', {
      components: ['CaaS'], sources: [source('E-2', { components: ['Connectivity&Fabric'] })]
    })
    const { result } = board([featureLevel, epicLevel])
    expect(panelKeys(result, 'CaaS')).toEqual(['F-2'])
    expect(panelKeys(result, 'Connectivity&Fabric').sort()).toEqual(['F-1', 'F-2'])
  })

  it('shows an enclave-only Feature under Enclave only', () => {
    const f = feature('F-1', {
      components: ['Enclave', 'Core'],
      ui: evidence('in-progress', [source('E-1')], { enclaveOnly: true })
    })
    const { result } = board([f])
    expect(panelKeys(result, 'Enclave')).toEqual(['F-1'])
    expect(panelKeys(result, 'Core')).toEqual([])
  })

  it('does not treat enclave-only as such once the UI evidence is not-applicable', () => {
    const f = feature('F-1', { ui: evidence('not-applicable', [source('E-1')], { enclaveOnly: true }) })
    expect(board([f]).analysis.cards).toEqual([])
  })

  it.each([
    ['enclave-only without an Enclave component', { components: ['Core'], ui: evidence('in-progress', [source('E-1')], { enclaveOnly: true }) }, OTHER_REASONS.enclaveWithoutComponent],
    ['no component anywhere', { components: [] }, OTHER_REASONS.noComponent],
    ['components with no panel', { components: ['UI'] }, OTHER_REASONS.unmappedComponents]
  ])('routes %s to Other with its reason', (_name, overrides, reason) => {
    const { result } = board([feature('F-1', overrides)])
    expect(panelKeys(result, 'Other')).toEqual(['F-1'])
    const [card] = result.panels.find(p => p.component === 'Other').cards
    expect(card.otherReason).toBe(reason)
    expect(card.alsoIn).toEqual([])
  })

  it('shows every eligible Feature in at least one panel, including Other', () => {
    const features = [
      feature('F-1', { components: ['Core'] }),
      feature('F-2', { components: ['Storage', 'Core'] }),
      feature('F-3', { components: [] }),
      feature('F-4', { components: ['UI'] }),
      feature('F-5', { components: ['Enclave'], ui: evidence('in-progress', [source('E-5')], { enclaveOnly: true }) }),
      feature('F-6', { components: ['Core'], ui: evidence('in-progress', [source('E-1')], { enclaveOnly: true }) }),
      feature('F-7', { resolution: 'Obsolete' })
    ]
    const { analysis, result } = board(features)
    const shown = new Set(result.panels.flatMap(p => p.cards.map(c => c.key)))
    expect([...shown].sort()).toEqual(analysis.cards.map(c => c.feature.key).sort())
    expect(result.distinctFeatureCount).toBe(6)
  })
})

describe('Match on', () => {
  const owner = feature('F-1', { assignee: 'Ada', sources: [source('E-1', { assignee: 'Grace' })] })
  const viaEpic = feature('F-2', { assignee: 'Linus', sources: [source('E-2', { assignee: 'Ada' })] })
  const deadEpic = feature('F-3', {
    assignee: 'Linus',
    sources: [source('E-3', { assignee: 'Linus' }), source('E-4', { assignee: 'Ada', resolution: 'Duplicate' })]
  })
  const features = [owner, viaEpic, deadEpic]
  const keys = (filters) => panelKeys(board(features, '0.5', filters).result, 'Core')

  it('either matches the Feature or a live source Epic, with provenance', () => {
    const { result } = board(features, '0.5', { assignees: ['Ada'], matchOn: 'either' })
    const cards = result.panels.find(p => p.component === 'Core').cards
    expect(cards.map(c => [c.key, c.matchedVia])).toEqual([
      ['F-1', { feature: true, epics: [] }],
      ['F-2', { feature: false, epics: ['E-2'] }]
    ])
    expect(cards[1].sources[0].matched).toBe(true)
  })

  it('feature mode ignores Epics, epics mode ignores the Feature', () => {
    expect(keys({ assignees: ['Ada'], matchOn: 'feature' })).toEqual(['F-1'])
    expect(keys({ assignees: ['Ada'], matchOn: 'epics' })).toEqual(['F-2'])
  })

  it('never matches through a no-work source Epic', () => {
    expect(keys({ assignees: ['Ada'], matchOn: 'epics' })).not.toContain('F-3')
  })

  it('applies to status and priority, each requiring a hit', () => {
    const mixed = [
      feature('F-1', { status: 'New', priority: 'Minor', sources: [source('E-1', { status: 'In Progress', priority: 'Blocker' })] }),
      feature('F-2', { status: 'In Progress', priority: 'Blocker', sources: [source('E-2', { status: 'New', priority: 'Minor' })] })
    ]
    const run = filters => panelKeys(board(mixed, '0.5', filters).result, 'Core')
    expect(run({ statuses: ['In Progress'], matchOn: 'epics' })).toEqual(['F-1'])
    expect(run({ priorities: ['Blocker'], matchOn: 'feature' })).toEqual(['F-2'])
    expect(run({ statuses: ['In Progress'], priorities: ['Blocker'], matchOn: 'either' }).sort()).toEqual(['F-1', 'F-2'])
    expect(run({ statuses: ['In Progress'], priorities: ['Minor'], matchOn: 'either' }).sort()).toEqual(['F-1', 'F-2'])
    expect(run({ statuses: ['New'], priorities: ['Blocker'], matchOn: 'either' }).sort()).toEqual(['F-1', 'F-2'])
  })

  it('offers only values present on the Feature or a live source Epic', () => {
    const { options } = board(features).result
    expect(options.assignees).toEqual(['Ada', 'Grace', 'Linus'])
    expect(options.priorities).toEqual(['Major', 'Normal'])
  })

  it('falls back to Feature-only matching when no source carries Epic fields', () => {
    const legacy = feature('F-1', { assignee: 'Ada', sources: [source('E-1')] })
    delete legacy.uiEvidence.sources[0].status
    delete legacy.uxEvidence.sources[0].status
    const other = feature('F-2', { assignee: 'Linus', sources: [source('E-2', { assignee: 'Ada' })] })
    delete other.uiEvidence.sources[0].status
    delete other.uxEvidence.sources[0].status
    const { analysis, result } = board([legacy, other], '0.5', { assignees: ['Ada'], matchOn: 'epics' })
    expect(analysis.hasEpicFields).toBe(false)
    expect(result.panels.find(p => p.component === 'Core').cards.map(c => c.key)).toEqual(['F-1'])
  })
})

describe('labels and component filter', () => {
  it('matches Feature labels without release scoping and offers only Feature labels', () => {
    const f = feature('F-1', {
      fixVersions: ['0.5'], labels: ['customer:telus'],
      sources: [source('E-1', { stageLabels: ['ux-needed'] })]
    })
    const { result } = board([f], '0.5', { labels: ['customer:telus'] })
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
    expect(result.options.labels).toEqual(['customer:telus'])
    expect(panelKeys(board([f], '0.5', { labels: ['customer:other'] }).result, 'Core')).toEqual([])
  })

  it('does not match a Feature through Epic stage, routing or workflow labels', () => {
    const owner = feature('F-1', { labels: ['customer:telus'] })
    const viaStage = feature('F-2', { sources: [source('E-2', { stageLabels: ['customer:telus'] })] })
    const viaRouting = feature('F-3', { sources: [source('E-3', { routingLabels: ['customer:telus'] })] })
    const viaWorkflow = feature('F-4', {
      workflowLabelSources: [{ epicKey: 'E-4', labels: ['customer:telus'] }]
    })
    const { result } = board([owner, viaStage, viaRouting, viaWorkflow], '0.5', { labels: ['customer:telus'] })
    expect(panelKeys(result, 'Core')).toEqual(['F-1'])
  })

  it('matches Feature labels case-insensitively', () => {
    const f = feature('F-1', { labels: ['Customer:Telus'] })
    expect(panelKeys(board([f], '0.5', { labels: ['customer:telus'] }).result, 'Core')).toEqual(['F-1'])
    expect(panelKeys(board([f], '0.5', { labels: [' CUSTOMER:TELUS '] }).result, 'Core')).toEqual(['F-1'])
  })

  it('narrows panels by component without changing membership counts', () => {
    const f = feature('F-1', { components: ['Core', 'Storage'] })
    const { result } = board([f], '0.5', { components: ['Storage'] })
    expect(panelKeys(result, 'Core')).toEqual([])
    expect(result.panels.find(p => p.component === 'Core').memberCount).toBe(1)
    expect(panelKeys(result, 'Storage')).toEqual(['F-1'])
    const [card] = result.panels.find(p => p.component === 'Storage').cards
    expect(card.alsoIn).toEqual(['Core'])
  })
})

describe('ordering', () => {
  it('sorts cards by Feature status rank, priority rank, then key', () => {
    const features = [
      feature('F-3', { status: 'New', priority: 'Blocker' }),
      feature('F-10', { status: 'In Progress', priority: 'Minor' }),
      feature('F-2', { status: 'In Progress', priority: 'Minor' }),
      feature('F-1', { status: 'In Progress', priority: 'Blocker' })
    ]
    expect(panelKeys(board(features).result, 'Core')).toEqual(['F-1', 'F-2', 'F-10', 'F-3'])
  })
})

describe('search', () => {
  const features = () => [
    feature('F-1', { summary: 'Cluster Provisioning wizard', sources: [source('E-100'), source('E-200')] }),
    feature('F-2', { summary: 'Storage tiers', sources: [source('E-300')] })
  ]

  it('matches Feature key, summary and source Epic keys, case-insensitively', () => {
    expect(panelKeys(board(features(), '0.5', { search: 'f-2' }).result, 'Core')).toEqual(['F-2'])
    expect(panelKeys(board(features(), '0.5', { search: 'PROVISIONING' }).result, 'Core')).toEqual(['F-1'])
    expect(panelKeys(board(features(), '0.5', { search: 'e-300' }).result, 'Core')).toEqual(['F-2'])
    expect(panelKeys(board(features(), '0.5', { search: '  ' }).result, 'Core')).toEqual(['F-1', 'F-2'])
    expect(panelKeys(board(features(), '0.5', { search: 'nothing' }).result, 'Core')).toEqual([])
  })

  it('marks only the Epics whose key matched, and none for a Feature-only hit', () => {
    const epicHit = board(features(), '0.5', { search: 'E-200' }).result.panels.find(p => p.component === 'Core').cards[0]
    expect(epicHit.sources.map(s => [s.epicKey, s.matched])).toEqual([['E-100', false], ['E-200', true]])
    expect(epicHit.matchedVia).toBeNull()
    const featureHit = board(features(), '0.5', { search: 'wizard' }).result.panels.find(p => p.component === 'Core').cards[0]
    expect(featureHit.sources.every(s => !s.matched)).toBe(true)
  })

  it('combines with the other filters', () => {
    const { result } = board(features(), '0.5', { search: 'f-', labels: ['none'] })
    expect(panelKeys(result, 'Core')).toEqual([])
  })

  it('searches within the selected release only', () => {
    const other = feature('F-9', { fixVersions: ['0.6'] })
    expect(panelKeys(board([...features(), other], '0.5', { search: 'F-9' }).result, 'Core')).toEqual([])
  })
})

describe('UX and UI status filters', () => {
  const features = () => [
    feature('F-1', { ux: evidence('design', [source('E-1')]), ui: evidence('in-progress', [source('E-1')]) }),
    feature('F-2', { ux: evidence('completed', [source('E-2')]), ui: evidence('not-started', [source('E-2')]) }),
    feature('F-3', { ux: evidence('not-applicable', [source('E-3')]), ui: evidence('in-progress', [source('E-3')]) })
  ]

  it('filters on the published Feature-level status of each workstream independently', () => {
    expect(panelKeys(board(features(), '0.5', { uxStatuses: ['design'] }).result, 'Core')).toEqual(['F-1'])
    expect(panelKeys(board(features(), '0.5', { uiStatuses: ['in-progress'] }).result, 'Core')).toEqual(['F-1', 'F-3'])
    expect(panelKeys(board(features(), '0.5', { uiStatuses: ['in-progress'], uxStatuses: ['not-applicable'] }).result, 'Core')).toEqual(['F-3'])
    expect(panelKeys(board(features(), '0.5', { uxStatuses: ['design', 'completed'] }).result, 'Core')).toEqual(['F-1', 'F-2'])
  })

  it('offers the statuses present in the release in display order', () => {
    const { options } = board(features()).result
    expect(options.uxStatuses).toEqual(['design', 'completed', 'not-applicable'])
    expect(options.uiStatuses).toEqual(['not-started', 'in-progress'])
  })

  it('does not depend on Match on and never marks Epic rows', () => {
    const { result } = board(features(), '0.5', { uxStatuses: ['design'], matchOn: 'epics' })
    const [card] = result.panels.find(p => p.component === 'Core').cards
    expect(card.key).toBe('F-1')
    expect(card.matchedVia).toBeNull()
    expect(card.sources.every(s => !s.matched)).toBe(true)
  })
})

