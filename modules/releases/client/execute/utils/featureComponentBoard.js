import { uiEvidenceOf, uxEvidenceOf } from '../composables/useUiUxFilter'
import {
  collectStatusOptions,
  collectAssigneeOptions,
  matchesStatus,
  matchesAssignee
} from '../composables/useComponentStatusFilter'

export const UNSCHEDULED = 'Unscheduled'
export const MATCH_ON_VALUES = ['either', 'feature', 'epics']

// Display order and labels for the published UI/UX workstream statuses.
export const UI_UX_STATUS_LABELS = {
  'not-started': 'Not Started', design: 'Design', 'in-progress': 'In Progress', completed: 'Completed',
  mixed: 'Mixed', unknown: 'Unknown', 'not-applicable': 'N/A'
}
const UI_UX_STATUS_ORDER = Object.keys(UI_UX_STATUS_LABELS)

export const OTHER_REASONS = {
  enclaveWithoutComponent: 'enclave-only label, no Enclave component',
  noComponent: 'no component on Feature or source epics',
  unmappedComponents: 'components not mapped to a panel',
  excludedByRules: 'excluded by panel rules'
}

// Same folding as the server's terminal-outcome profile validation.
const fold = value => String(value ?? '').trim().toLowerCase().replace(/’/g, "'")

function resolutionName(resolution) {
  if (typeof resolution === 'string') return resolution
  if (resolution && typeof resolution === 'object') return resolution.name
  return ''
}

const foldedSet = list => new Set((list || []).map(fold))

// Only the Feature's own Jira labels count, matching the label options the board offers; Epic
// stage, routing and workflow labels never place a Feature under another Feature's label.
function matchesFeatureLabels(feature, selectedLabels) {
  if (!selectedLabels || selectedLabels.length === 0) return true
  const wanted = foldedSet(selectedLabels)
  return (feature.labels || []).some(label => wanted.has(fold(label)))
}

// Release names are strings; any other value normalizes to '' (no release).
function normalizeRelease(version) {
  return typeof version === 'string' ? version.replace(/\.z\b/gi, '').trim() : ''
}

// A Feature's own Fix Versions only; none means Unscheduled. Epic releases never place it.
export function releasesOf(feature) {
  const seen = new Map()
  const versions = Array.isArray(feature?.fixVersions) ? feature.fixVersions : []
  for (const version of versions) {
    const stripped = normalizeRelease(version)
    if (stripped && !seen.has(fold(stripped))) seen.set(fold(stripped), stripped)
  }
  return seen.size > 0 ? [...seen.values()] : [UNSCHEDULED]
}

/** The option matching a requested release under the same folding that places Features; null when none. */
export function resolveReleaseOption(options, requested) {
  const target = fold(normalizeRelease(requested))
  if (!target) return null
  return (options || []).find(option => fold(option) === target) ?? null
}

function compareReleases(a, b) {
  if (a === UNSCHEDULED || b === UNSCHEDULED) return (a === UNSCHEDULED) - (b === UNSCHEDULED)
  return a.localeCompare(b, 'en', { numeric: true })
}

function rankOf(rankList, value) {
  const index = rankList.findIndex(item => fold(item) === fold(value))
  return index < 0 ? rankList.length : index
}

// Listed values first in rank order; unlisted values after them, alphabetically.
function compareRanked(rankList, a, b) {
  const rankA = rankOf(rankList, a)
  const rankB = rankOf(rankList, b)
  if (rankA !== rankB) return rankA - rankB
  return rankA === rankList.length ? fold(a).localeCompare(fold(b)) : 0
}

const compareKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })

const EPIC_FIELDS = ['epicType', 'status', 'assignee', 'priority', 'resolution']
const EPIC_LISTS = ['fixVersions', 'components']

/**
 * One row per distinct source Epic across UI and UX evidence, with each workstream's own status.
 * Both entries describe the same Epic, so a field one entry lacks (undefined) is taken from the other;
 * an explicit null is a value and is kept.
 */
function mergeSources(feature, noWork) {
  const rows = new Map()
  for (const [workstream, evidence] of [['ui', uiEvidenceOf(feature)], ['ux', uxEvidenceOf(feature)]]) {
    for (const source of evidence.sources || []) {
      let row = rows.get(source.epicKey)
      if (!row) {
        row = { epicKey: source.epicKey, fixVersions: [], components: [], ui: null, ux: null }
        rows.set(source.epicKey, row)
      }
      for (const field of EPIC_FIELDS) if (row[field] === undefined) row[field] = source[field]
      for (const field of EPIC_LISTS) {
        for (const value of source[field] || []) if (!row[field].includes(value)) row[field].push(value)
      }
      row[workstream] = source.localStatus
    }
  }
  return [...rows.values()].map(row => ({ ...row, noWork: noWork.has(fold(resolutionName(row.resolution))) }))
}

function enclaveOnlyOf(feature) {
  const ui = uiEvidenceOf(feature)
  return ui.enclaveOnly === true && ui.status !== 'not-applicable'
}

/** Panels a Feature belongs to (component names, in config order); empty when it falls to Other. */
function routeToPanels(feature, liveSources, config) {
  const featureComponents = foldedSet(feature.components)
  const allComponents = new Set(featureComponents)
  for (const source of liveSources) for (const component of source.components) allComponents.add(fold(component))
  const enclaveOnly = enclaveOnlyOf(feature)

  const named = config.panels.filter(panel => allComponents.has(fold(panel.component)))
  const panels = named.filter(panel => {
    if (enclaveOnly && panel.component !== config.enclavePanel) return false
    return !panel.notInComponents.some(component => featureComponents.has(fold(component)))
  })
  if (panels.length > 0) return { panels: panels.map(panel => panel.component), otherReason: null }

  let otherReason = OTHER_REASONS.excludedByRules
  if (enclaveOnly && !allComponents.has(fold(config.enclavePanel))) otherReason = OTHER_REASONS.enclaveWithoutComponent
  else if (allComponents.size === 0) otherReason = OTHER_REASONS.noComponent
  else if (named.length === 0) otherReason = OTHER_REASONS.unmappedComponents
  return { panels: [], otherReason }
}

/**
 * Eligibility, placement and panel routing for every Feature with UI/UX source Epics.
 * Badges are the collector's published evidence; nothing is re-aggregated here.
 * `terminalOutcomeProfile.nonDelivery`, when the project defines one, replaces the config list.
 */
export function analyzeFeatures(features, config, terminalOutcomeProfile = null) {
  const nonDelivery = foldedSet(terminalOutcomeProfile?.nonDelivery ?? config.nonDeliveryResolutions)
  const noWork = foldedSet(config.noWorkResolutions)
  const cards = []
  const notShown = []

  for (const feature of features || []) {
    const sources = mergeSources(feature, noWork)
    // Features without UI/UX source Epics are outside this board.
    if (sources.length === 0) continue
    const releases = releasesOf(feature)
    const resolution = resolutionName(feature.resolution) || null
    const liveSources = sources.filter(source => !source.noWork)

    if (nonDelivery.has(fold(resolution))) {
      notShown.push({ key: feature.key, summary: feature.summary, resolution, reason: 'non-delivery', releases })
      continue
    }
    if (liveSources.length === 0) {
      notShown.push({ key: feature.key, summary: feature.summary, resolution, reason: 'no-live-source', releases })
      continue
    }
    if (uiEvidenceOf(feature).status === 'not-applicable') {
      notShown.push({ key: feature.key, summary: feature.summary, resolution, reason: 'no-ui', releases })
      continue
    }

    const { panels, otherReason } = routeToPanels(feature, liveSources, config)
    cards.push({ feature, resolution, releases, sources, liveSources, panels, otherReason })
  }

  const releasesWithCards = [...new Set(cards.flatMap(card => card.releases))].sort(compareReleases)
  // Every release with an eligible or excluded Feature is selectable, so its Not shown list stays reachable.
  const releaseOptions = [...new Set([...releasesWithCards, ...notShown.flatMap(entry => entry.releases)])]
    .sort(compareReleases)
  const hasEpicFields = cards.some(card => card.liveSources.some(source => source.status !== undefined))
  return { cards, notShown, releaseOptions, releasesWithCards, hasEpicFields }
}

const matchesPriority = (priority, selected) =>
  selected.length === 0 || selected.includes(priority || 'Undefined')

const matchesWorkstream = (status, selected) => selected.length === 0 || selected.includes(status)

/**
 * Whether the card passes every active filter, and which Epics matched: `via` for the Feature/Epic
 * status, assignee and priority filters, `searchEpics` for Epic keys matching the search text.
 */
function evaluateCard(card, filters, matchOn) {
  const { feature, liveSources } = card
  const tests = []
  if (filters.statuses.length > 0) {
    tests.push({ test: item => matchesStatus(item.status, filters.statuses) })
  }
  if (filters.assignees.length > 0) {
    tests.push({ test: item => matchesAssignee(item.assignee, filters.assignees) })
  }
  if (filters.priorities.length > 0) {
    tests.push({ test: item => matchesPriority(item.priority, filters.priorities) })
  }

  const via = { feature: false, epics: new Set() }
  let passes = matchesFeatureLabels(feature, filters.labels) &&
    matchesWorkstream(uiEvidenceOf(feature).status, filters.uiStatuses) &&
    matchesWorkstream(uxEvidenceOf(feature).status, filters.uxStatuses)

  const query = filters.search.trim().toLowerCase()
  const searchEpics = new Set()
  if (query) {
    const featureHit = [feature.key, feature.summary].some(text => String(text ?? '').toLowerCase().includes(query))
    for (const source of card.sources) {
      if (String(source.epicKey).toLowerCase().includes(query)) searchEpics.add(source.epicKey)
    }
    if (!featureHit && searchEpics.size === 0) passes = false
  }

  for (const { test } of tests) {
    const featureHit = matchOn !== 'epics' && test(feature)
    const epicHits = matchOn === 'feature' ? [] : liveSources.filter(test)
    if (!featureHit && epicHits.length === 0) passes = false
    via.feature ||= featureHit
    for (const source of epicHits) via.epics.add(source.epicKey)
  }
  return { passes, via: tests.length > 0 ? via : null, searchEpics }
}

function toBoardCard(card, panelComponent, config, { via, searchEpics }) {
  const { feature } = card
  const sortedSources = [...card.sources].sort((a, b) =>
    compareRanked(config.statusRank, a.status, b.status) ||
    compareRanked(config.priorityRank, a.priority || 'Undefined', b.priority || 'Undefined') ||
    compareKeys(a.epicKey, b.epicKey)
  )
  const ui = uiEvidenceOf(feature)
  const ux = uxEvidenceOf(feature)
  return {
    key: feature.key,
    summary: feature.summary,
    status: feature.status,
    resolution: card.resolution,
    priority: feature.priority,
    assignee: feature.assignee,
    labels: feature.labels || [],
    components: feature.components || [],
    ui: { status: ui.status, conflict: !!ui.conflict },
    ux: { status: ux.status, conflict: !!ux.conflict },
    sources: sortedSources.map(source => ({
      ...source,
      matched: (!!via && via.epics.has(source.epicKey)) || searchEpics.has(source.epicKey)
    })),
    alsoIn: card.panels.filter(component => component !== panelComponent),
    otherReason: panelComponent === null ? card.otherReason : null,
    matchedVia: via ? { feature: via.feature, epics: [...via.epics].sort(compareKeys) } : null
  }
}

function compareBoardCards(config, a, b) {
  return compareRanked(config.statusRank, a.status, b.status) ||
    compareRanked(config.priorityRank, a.priority || 'Undefined', b.priority || 'Undefined') ||
    compareKeys(a.key, b.key)
}

function collectPriorityOptions(items, config) {
  const values = [...new Set(items.map(item => item.priority || 'Undefined'))]
  return values.sort((a, b) => compareRanked(config.priorityRank, a, b))
}

function collectWorkstreamStatuses(cards, evidenceOf) {
  const present = new Set(cards.map(({ feature }) => evidenceOf(feature).status))
  const unlisted = [...present].filter(status => !UI_UX_STATUS_ORDER.includes(status)).sort()
  return [...UI_UX_STATUS_ORDER.filter(status => present.has(status)), ...unlisted]
}

function collectFeatureLabelOptions(cards) {
  const byFolded = new Map()
  for (const { feature } of cards) {
    for (const label of feature.labels || []) {
      const trimmed = String(label ?? '').trim()
      if (trimmed && !byFolded.has(fold(trimmed))) byFolded.set(fold(trimmed), trimmed)
    }
  }
  return [...byFolded.values()].sort((a, b) => a.localeCompare(b))
}

/** Groups the analyzed Feature cards of one release into component panels plus Other. */
export function buildFeatureBoard(analysis, config, release, filters = {}) {
  const {
    components = [], statuses = [], assignees = [], priorities = [], labels = [], matchOn = 'either',
    uiStatuses = [], uxStatuses = [], search = ''
  } = filters
  const effectiveMatchOn = analysis.hasEpicFields ? matchOn : 'feature'
  const normalized = { statuses, assignees, priorities, labels, uiStatuses, uxStatuses, search }
  const target = fold(release)
  const inRelease = analysis.cards.filter(card => card.releases.some(r => fold(r) === target))
  const evaluated = new Map(inRelease.map(card => [card, evaluateCard(card, normalized, effectiveMatchOn)]))

  const panelDefs = [
    ...config.panels.map(panel => ({ component: panel.component, id: panel.id })),
    { component: config.otherPanel, id: config.otherPanel }
  ]
  const wantedComponents = components.map(fold)

  const panels = []
  const distinct = new Set()
  let rowCount = 0
  for (const def of panelDefs) {
    const isOther = def.component === config.otherPanel
    const members = inRelease.filter(card => isOther ? card.panels.length === 0 : card.panels.includes(def.component))
    const narrowed = wantedComponents.length > 0 && !wantedComponents.includes(fold(def.component))
    const cards = narrowed ? [] : members
      .filter(card => evaluated.get(card).passes)
      .map(card => toBoardCard(card, isOther ? null : def.component, config, evaluated.get(card)))
      .sort((a, b) => compareBoardCards(config, a, b))
    for (const card of cards) distinct.add(card.key)
    rowCount += cards.length
    panels.push({ id: def.id, component: def.component, cards, memberCount: members.length })
  }

  const optionItems = inRelease.flatMap(card => [card.feature, ...card.liveSources])
  return {
    panels,
    distinctFeatureCount: distinct.size,
    rowCount,
    notShown: analysis.notShown
      .filter(entry => entry.releases.some(r => fold(r) === target))
      .sort((a, b) => compareKeys(a.key, b.key)),
    options: {
      components: panelDefs.map(def => def.component),
      statuses: collectStatusOptions(optionItems, item => item.status),
      assignees: collectAssigneeOptions(optionItems, item => item.assignee),
      priorities: collectPriorityOptions(optionItems, config),
      labels: collectFeatureLabelOptions(inRelease),
      uiStatuses: collectWorkstreamStatuses(inRelease, uiEvidenceOf),
      uxStatuses: collectWorkstreamStatuses(inRelease, uxEvidenceOf)
    }
  }
}
