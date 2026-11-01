import { projectKeyOf } from './readiness'
import {
  collectStatusOptions,
  collectAssigneeOptions,
  matchesStatus,
  matchesAssignee
} from '../composables/useComponentStatusFilter'

const fold = value => String(value ?? '').trim().toLowerCase()

function includesFolded(list, target) {
  return Array.isArray(list) && list.some(item => fold(item) === target)
}

function stripZStream(version) {
  return String(version).replace(/\.z\b/gi, '')
}

function resolutionName(resolution) {
  if (typeof resolution === 'string') return resolution
  if (resolution && typeof resolution === 'object') return resolution.name
  return ''
}

// Missing provenance counts as not direct: Jira JQL only sees values set on the Epic itself.
function hasDirectVersion(epic, release) {
  if (epic.fixVersionSource !== 'direct') return false
  const target = fold(stripZStream(release))
  return (epic.fixVersions || []).some(version => fold(stripZStream(version)) === target)
}

function hasDirectComponent(epic, component) {
  return epic.componentSource === 'direct' && includesFolded(epic.components, fold(component))
}

export function matchesPanel(epic, panel, config, release) {
  if (!epic || !release) return false
  if (fold(projectKeyOf(epic.key)) !== fold(config.jiraProjectKey)) return false
  if (!includesFolded(epic.labels, fold(config.scopeLabel))) return false
  if (panel.excludedLabels.some(label => includesFolded(epic.labels, fold(label)))) return false
  if (!hasDirectComponent(epic, panel.component)) return false
  if (panel.notInComponents.some(component => includesFolded(epic.components, fold(component)))) return false
  if (!hasDirectVersion(epic, release)) return false
  return fold(resolutionName(epic.resolution)) !== 'duplicate'
}

const epicIdentity = epic => fold(epic?.key)

function updatedMillis(epic) {
  const time = Date.parse(epic.updated)
  return Number.isNaN(time) ? -Infinity : time
}

// Final tie-break so equally fresh duplicates resolve the same way for any input order.
function tieBreakKey(epic) {
  const sorted = list => [...(list || [])].map(fold).sort()
  return JSON.stringify([
    fold(epic.parentFeatureKey), epic.fixVersionSource, sorted(epic.fixVersions), epic.componentSource,
    sorted(epic.components), sorted(epic.labels), fold(resolutionName(epic.resolution)), fold(epic.status),
    epic.summary, epic.priority, epic.assignee
  ])
}

function isPreferredRecord(candidate, current) {
  const candidateTime = updatedMillis(candidate)
  const currentTime = updatedMillis(current)
  if (candidateTime !== currentTime) return candidateTime > currentTime
  return tieBreakKey(candidate) < tieBreakKey(current)
}

// Duplicate rows describe one Jira issue: the most recently updated record is kept whole, never merged.
export function collectEpics(features) {
  const byIdentity = new Map()
  for (const feature of features || []) {
    for (const epic of feature?.epics || []) {
      const identity = epicIdentity(epic)
      if (!identity) continue
      const current = byIdentity.get(identity)
      if (!current || isPreferredRecord(epic, current)) byIdentity.set(identity, epic)
    }
  }
  return [...byIdentity.values()]
}

export function collectLabelOptions(epics) {
  const byFolded = new Map()
  for (const epic of epics) {
    for (const label of epic.labels || []) {
      const trimmed = String(label ?? '').trim()
      if (!trimmed) continue
      const existing = byFolded.get(fold(trimmed))
      if (existing === undefined || trimmed < existing) byFolded.set(fold(trimmed), trimmed)
    }
  }
  return [...byFolded.values()].sort((a, b) => fold(a).localeCompare(fold(b)))
}

export function matchesLabels(labels, selected) {
  if (!selected || selected.length === 0) return true
  const wanted = new Set(selected.map(fold))
  return (labels || []).some(label => wanted.has(fold(label)))
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

export function sortEpics(epics, config) {
  return [...epics].sort((a, b) =>
    compareRanked(config.statusRank, a.status, b.status) ||
    compareRanked(config.priorityRank, a.priority || 'Undefined', b.priority || 'Undefined') ||
    String(a.key).localeCompare(String(b.key), 'en', { numeric: true })
  )
}

/** Groups a release's Epics into component panels. Filters only narrow rows; `options` and `alsoIn` reflect membership. */
export function buildComponentPanels(features, config, release, filters = {}) {
  const { components = [], statuses = [], assignees = [], labels = [] } = filters
  const epics = collectEpics(features)

  const membership = config.panels.map(panel => ({
    panel,
    members: epics.filter(epic => matchesPanel(epic, panel, config, release))
  }))

  const panelsByEpic = new Map()
  for (const { panel, members } of membership) {
    for (const epic of members) {
      const identity = epicIdentity(epic)
      panelsByEpic.set(identity, [...(panelsByEpic.get(identity) || []), panel.component])
    }
  }

  const memberEpics = collectEpics([{ epics: membership.flatMap(({ members }) => members) }])
  const wantedComponents = components.map(fold)

  const panels = []
  const distinct = new Set()
  let rowCount = 0
  for (const { panel, members } of membership) {
    if (wantedComponents.length > 0 && !wantedComponents.includes(fold(panel.component))) continue
    const rows = sortEpics(members.filter(epic =>
      matchesStatus(epic.status, statuses) &&
      matchesAssignee(epic.assignee, assignees) &&
      matchesLabels(epic.labels, labels)
    ), config).map(epic => ({
      epic,
      alsoIn: panelsByEpic.get(epicIdentity(epic)).filter(component => component !== panel.component)
    }))
    for (const { epic } of rows) distinct.add(epicIdentity(epic))
    rowCount += rows.length
    panels.push({ id: panel.id, component: panel.component, rows, memberCount: members.length })
  }

  return {
    panels,
    distinctEpicCount: distinct.size,
    rowCount,
    options: {
      components: config.panels.map(panel => panel.component),
      statuses: collectStatusOptions(memberEpics, epic => epic.status),
      assignees: collectAssigneeOptions(memberEpics, epic => epic.assignee),
      labels: collectLabelOptions(memberEpics)
    }
  }
}
