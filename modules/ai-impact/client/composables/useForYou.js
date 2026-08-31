import { computed, ref } from 'vue'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { useRoster } from '@shared/client/composables/useRoster.js'
import { useFieldDefinitions } from '@shared/client/composables/useFieldDefinitions.js'
import { useAIImpact } from './useAIImpact.js'
import { useFeatures } from './useFeatures.js'
import { useAssessments } from './useAssessments.js'
import { useForYouPreferences } from './useForYouPreferences.js'

const SCOPE_LABEL = 'strat-creator-3.5'

const RFE_STATES = {
  NOT_ASSESSED: { id: 'not-assessed', label: 'Not Yet Assessed', color: 'gray', order: 4 },
  NEEDS_REVISION: { id: 'needs-revision', label: 'Needs Revision', color: 'red', order: 0 },
  PASSED_WITH_CAVEATS: { id: 'passed-with-caveats', label: 'Passed with Caveats', color: 'amber', order: 1 },
  READY_TO_ADVANCE: { id: 'ready-to-advance', label: 'Ready for Feature Creation', color: 'amber', order: 2 },
  QUEUED_FOR_PIPELINE: { id: 'queued-for-pipeline', label: 'Queued for Feature Creation', color: 'blue', order: 3 }
}

const FEATURE_STATES = {
  PRD_PENDING: { id: 'prd-pending', label: 'PRD Pending', color: 'red', order: 0 },
  DESIGN_PENDING: { id: 'design-pending', label: 'Design Pending', color: 'amber', order: 1 },
  READY_FOR_IMPLEMENTATION: { id: 'ready-for-implementation', label: 'Ready for Implementation', color: 'green', order: 2 }
}

function classifyRfe(rfe) {
  const labels = new Set(rfe.labels || [])
  const hasLinkedFeature = !!rfe.linkedFeature
  const hasRubricPass = labels.has('rfe-creator-autofix-rubric-pass')
  const hasNeedsAttention = labels.has('rfe-creator-needs-attention')
  const hasTechReviewed = labels.has('tech-reviewed')
  const hasScopeLabel = labels.has(SCOPE_LABEL)

  if (hasLinkedFeature) return null
  if (hasNeedsAttention && !hasRubricPass) return RFE_STATES.NEEDS_REVISION
  if (hasRubricPass && hasNeedsAttention) return RFE_STATES.PASSED_WITH_CAVEATS
  if ((hasRubricPass || hasTechReviewed) && !hasScopeLabel) return RFE_STATES.READY_TO_ADVANCE
  if ((hasRubricPass || hasTechReviewed) && hasScopeLabel) return RFE_STATES.QUEUED_FOR_PIPELINE
  return RFE_STATES.NOT_ASSESSED
}

function classifyFeature(feature) {
  if (feature.prdPrStatus !== 'Merged') return FEATURE_STATES.PRD_PENDING
  if (feature.humanReviewStatus !== 'approved') return FEATURE_STATES.DESIGN_PENDING
  return FEATURE_STATES.READY_FOR_IMPLEMENTATION
}

function computeWaitDays(item, state, type) {
  let dateStr
  if (type === 'rfe') {
    if (state.id === 'needs-revision' || state.id === 'passed-with-caveats') {
      dateStr = item.needsAttentionSince || item.created
    } else if (state.id === 'ready-to-advance' || state.id === 'queued-for-pipeline') {
      dateStr = item.rubricPassSince || item.created
    } else {
      dateStr = item.created
    }
  } else {
    dateStr = item.reviewedAt || item.created
  }
  if (!dateStr) return 0
  const ms = new Date(dateStr).getTime()
  if (Number.isNaN(ms)) return 0
  const diff = Date.now() - ms
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

const PRIORITY_ORDER = { Blocker: 0, Critical: 1, High: 2, Major: 3, Medium: 4, Normal: 5, Minor: 6, Low: 7, None: 8, Undefined: 9 }

function sortItems(items) {
  return [...items].sort((a, b) => {
    const waitDiff = b.waitDays - a.waitDays
    if (waitDiff !== 0) return waitDiff
    return (PRIORITY_ORDER[a.priority] ?? 10) - (PRIORITY_ORDER[b.priority] ?? 10)
  })
}

function findPersonByUid(rosterData, uid) {
  if (!rosterData?.orgs) return null
  for (const org of rosterData.orgs) {
    if (!org.teams) continue
    for (const team of Object.values(org.teams)) {
      if (!team.members) continue
      for (const member of team.members) {
        if (member.uid === uid) return member
      }
    }
  }
  return null
}

function resolveUserComponents(rosterData, user, fieldDefinitions) {
  if (!user?.email) return { components: [], displayName: null, state: 'not-found' }

  const uid = user.email.split('@')[0]
  const person = findPersonByUid(rosterData, uid)
  if (!person) return { components: [], displayName: null, state: 'not-found' }

  const displayName = person.name || person.jiraDisplayName || uid

  const personFields = fieldDefinitions?.personFields || []
  const componentField = personFields.find(f => f.optionsRef === 'component')
  if (!componentField) return { components: [], displayName, state: 'no-components' }

  const val = person.customFields?.[componentField.id]
  const components = Array.isArray(val) ? val : (val ? [val] : [])
  if (components.length === 0) return { components: [], displayName, state: 'no-components' }

  return { components, displayName, state: 'resolved' }
}

function filterByComponents(items, userComponents) {
  if (!userComponents.length) return items
  const userSet = new Set(userComponents)
  return items.filter(item => {
    const itemComponents = item.components || []
    return itemComponents.some(c => userSet.has(c))
  })
}

// Singleton refs for filter state
const stageFilter = ref([])
const priorityFilter = ref([])
const componentFilter = ref([])
// Feature Board-only: scopes boardColumns without affecting the shared RFE
// action-item pipeline (actionNeeded/everythingElse/stats), which has no
// concept of fix versions.
const versionFilter = ref([])
let initialized = false

export function useForYou(rosterDataArg, userArg, rfeDataArg, featuresArg, assessmentsArg, fieldDefinitionsArg, optionsArg) {
  // Support both legacy parametric and new singleton usage
  const { user } = userArg ? { user: userArg } : useAuth()
  const { rosterData } = rosterDataArg ? { rosterData: rosterDataArg } : useRoster()
  const { rfeData } = rfeDataArg ? { rfeData: rfeDataArg } : useAIImpact()
  const { features } = featuresArg ? { features: featuresArg } : useFeatures()
  const { assessments } = assessmentsArg ? { assessments: assessmentsArg } : useAssessments()
  const { definitions: fieldDefinitions } = fieldDefinitionsArg ? { definitions: fieldDefinitionsArg } : useFieldDefinitions()

  let mode, manualComponents
  if (optionsArg) {
    mode = optionsArg.mode || ref('auto')
    manualComponents = optionsArg.manualComponents || ref([])
  } else {
    const prefs = useForYouPreferences()
    mode = prefs.mode
    manualComponents = prefs.manualComponents
  }

  if (!initialized) {
    initialized = true
  }

  const userResolution = computed(() => {
    if (mode.value === 'manual') {
      const comps = manualComponents.value
      const displayName = user.value?.email?.split('@')[0] || null
      if (comps.length === 0) {
        return { components: [], displayName, state: 'manual-empty' }
      }
      return { components: comps, displayName, state: 'manual' }
    }
    return resolveUserComponents(rosterData.value, user.value, fieldDefinitions.value)
  })

  const userComponents = computed(() => userResolution.value.components)
  const userDisplayName = computed(() => userResolution.value.displayName)
  const rosterResolutionState = computed(() => userResolution.value.state)

  const classifiedItems = computed(() => {
    const items = []
    const rfes = rfeData.value?.issues || []
    const userComps = userComponents.value
    const filteredRfes = filterByComponents(rfes, userComps)

    for (const rfe of filteredRfes) {
      const state = classifyRfe(rfe)
      if (!state) continue
      const assessment = assessments.value?.[rfe.key]
      const waitDays = computeWaitDays(rfe, state, 'rfe')
      items.push({
        type: 'rfe',
        key: rfe.key,
        summary: rfe.summary,
        components: rfe.components || [],
        priority: rfe.priority,
        labels: rfe.labels || [],
        created: rfe.created,
        state,
        waitDays,
        scores: assessment?.scores || null,
        linkedFeature: rfe.linkedFeature,
        assessedAt: assessment?.assessedAt || null
      })
    }

    const featureMap = features.value || {}
    const featureList = Object.values(featureMap)
    const filteredFeatures = filterByComponents(featureList, userComps)

    for (const feature of filteredFeatures) {
      const state = classifyFeature(feature)
      const waitDays = computeWaitDays(feature, state, 'feature')
      items.push({
        type: 'feature',
        key: feature.key,
        summary: feature.title,
        components: feature.components || [],
        priority: feature.priority,
        labels: feature.labels || [],
        created: feature.reviewedAt,
        state,
        waitDays,
        scores: feature.scores || null,
        recommendation: feature.recommendation,
        humanReviewStatus: feature.humanReviewStatus,
        sourceRfe: feature.sourceRfe,
        reviewedAt: feature.reviewedAt,
        approvedBy: feature.approvedBy || null,
        fixVersions: feature.fixVersions || []
      })
    }

    return items
  })

  const availableItemComponents = computed(() => {
    const set = new Set()
    for (const item of classifiedItems.value) {
      for (const c of item.components || []) {
        set.add(c)
      }
    }
    return [...set].sort()
  })

  const availableItemVersions = computed(() => {
    const set = new Set()
    for (const item of classifiedItems.value) {
      if (item.type !== 'feature') continue
      for (const v of item.fixVersions || []) {
        set.add(v)
      }
    }
    return [...set].sort()
  })

  const filteredItems = computed(() => {
    let items = classifiedItems.value
    if (stageFilter.value.length > 0) {
      const stageSet = new Set(stageFilter.value)
      items = items.filter(i => stageSet.has(i.state.id))
    }
    if (priorityFilter.value.length > 0) {
      const prioritySet = new Set(priorityFilter.value)
      items = items.filter(i => prioritySet.has(i.priority))
    }
    if (componentFilter.value.length > 0) {
      const filterSet = new Set(componentFilter.value)
      items = items.filter(i => (i.components || []).some(c => filterSet.has(c)))
    }
    return items
  })

  const actionNeeded = computed(() => {
    const items = filteredItems.value.filter(i => {
      if (i.type === 'rfe') {
        return ['needs-revision', 'passed-with-caveats', 'ready-to-advance'].includes(i.state.id)
      }
      return ['prd-pending', 'design-pending'].includes(i.state.id)
    })
    return sortItems(items)
  })

  const everythingElse = computed(() => {
    const items = filteredItems.value.filter(i => {
      if (i.type === 'rfe') {
        return ['queued-for-pipeline', 'not-assessed'].includes(i.state.id)
      }
      return i.state.id === 'ready-for-implementation'
    })
    return sortItems(items)
  })

  // Feature Board: Features only (see FEATURE_STATES). RFE pipeline items live
  // in actionNeeded/everythingElse/actionGroups instead, via RfeActionsWidget.
  const boardColumns = computed(() => {
    const columns = [
      { ...FEATURE_STATES.PRD_PENDING, items: [] },
      { ...FEATURE_STATES.DESIGN_PENDING, items: [] },
      { ...FEATURE_STATES.READY_FOR_IMPLEMENTATION, items: [] }
    ]
    const columnMap = {}
    for (const col of columns) {
      columnMap[col.id] = col
    }
    const versionSet = versionFilter.value.length > 0 ? new Set(versionFilter.value) : null
    for (const item of filteredItems.value) {
      if (item.type !== 'feature') continue
      if (versionSet && !(item.fixVersions || []).some(v => versionSet.has(v))) continue
      const col = columnMap[item.state.id]
      if (col) {
        col.items.push(item)
      }
    }
    return columns
  })

  const actionGroups = computed(() => {
    const groups = [
      { id: 'failed-rubric', label: 'PRDs Failed Rubric', items: [] },
      { id: 'passed-with-caveats', label: 'PRDs Passed with Caveats', items: [] },
      { id: 'advance-rfes', label: 'PRDs Ready for Feature Creation', items: [] },
      { id: 'review-features', label: 'Features Needing Review', items: [] }
    ]
    for (const item of actionNeeded.value) {
      if (item.type === 'rfe' && item.state.id === 'needs-revision') {
        groups[0].items.push(item)
      } else if (item.type === 'rfe' && item.state.id === 'passed-with-caveats') {
        groups[1].items.push(item)
      } else if (item.type === 'rfe' && item.state.id === 'ready-to-advance') {
        groups[2].items.push(item)
      } else if (item.type === 'feature') {
        groups[3].items.push(item)
      }
    }
    return groups.filter(g => g.items.length > 0)
  })

  const stats = computed(() => {
    const all = classifiedItems.value
    const reviseRfes = all.filter(i =>
      i.type === 'rfe' && ['needs-revision', 'passed-with-caveats'].includes(i.state.id)
    ).length
    const reviewFeatures = all.filter(i =>
      i.type === 'feature' && ['prd-pending', 'design-pending'].includes(i.state.id)
    ).length
    const queuedForStrat = all.filter(i =>
      i.type === 'rfe' && i.state.id === 'ready-to-advance'
    ).length
    const signedOffFeatures = all.filter(i =>
      i.type === 'feature' && i.state.id === 'ready-for-implementation'
    ).length
    return { reviseRfes, reviewFeatures, queuedForStrat, signedOffFeatures }
  })

  return {
    userComponents,
    userDisplayName,
    rosterResolutionState,
    classifiedItems,
    actionNeeded,
    everythingElse,
    boardColumns,
    actionGroups,
    stats,
    stageFilter,
    priorityFilter,
    componentFilter,
    availableItemComponents,
    versionFilter,
    availableItemVersions
  }
}

// Exports for testing
export {
  classifyRfe,
  classifyFeature,
  computeWaitDays,
  resolveUserComponents,
  filterByComponents,
  findPersonByUid,
  RFE_STATES,
  FEATURE_STATES,
  SCOPE_LABEL
}
