<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { useFeatureTraffic } from '../composables/useFeatureTraffic'
import { useReleaseRegistry } from '../composables/useReleaseRegistry'
import { useComponentStatusFilter } from '../composables/useComponentStatusFilter'
import { resolveComponentDashboard } from '../utils/componentDashboardConfig'
import { analyzeFeatures, buildFeatureBoard, resolveReleaseOption, UNSCHEDULED } from '../utils/featureComponentBoard'
import { pickDefaultRelease } from '../utils/releaseDefault'
import ComponentStatusFilterBar from '../components/ComponentStatusFilterBar.vue'
import FeatureComponentPanel from '../components/FeatureComponentPanel.vue'

const JIRA_BASE = 'https://redhat.atlassian.net/browse/'

const nav = inject('moduleNav')
const projectId = useProjectId()
const dashboard = computed(() => resolveComponentDashboard(projectId.value))

const { releases: registryReleases, error: registryError, loadRegistry } = useReleaseRegistry()
const {
  features, fetchedAt, loading, error, state: featureState, message: featureMessage, terminalOutcomeProfile, loadFeatures
} = useFeatureTraffic()
const {
  selectedComponents,
  selectedStatuses,
  selectedAssignees,
  toggleComponent,
  toggleStatus,
  toggleAssignee,
  setAssignees
} = useComponentStatusFilter()
const selectedPriorities = ref([])
const selectedLabels = ref([])
const matchOn = ref('either')

const { user } = useAuth()
// Hidden when no reliable jiraDisplayName is resolved for the current user — never guessed client-side.
const meAssignee = computed(() => user.value?.jiraDisplayName || null)

const selectedVersion = ref('')
const releaseNotice = ref('')
const initializing = ref(false)

const isFiltered = computed(() =>
  selectedComponents.value.length > 0 || selectedStatuses.value.length > 0 ||
  selectedAssignees.value.length > 0 || selectedPriorities.value.length > 0 ||
  selectedLabels.value.length > 0
)

function clearAllFilters() {
  selectedComponents.value = []
  selectedStatuses.value = []
  selectedAssignees.value = []
  selectedPriorities.value = []
  selectedLabels.value = []
}

function toggleInList(listRef, value) {
  const index = listRef.value.indexOf(value)
  if (index >= 0) listRef.value.splice(index, 1)
  else listRef.value.push(value)
}

const togglePriority = value => toggleInList(selectedPriorities, value)
const toggleLabel = value => toggleInList(selectedLabels, value)

function selectMeAssignee() {
  if (meAssignee.value) setAssignees([meAssignee.value])
}

const analysis = computed(() =>
  dashboard.value ? analyzeFeatures(features.value, dashboard.value.config, terminalOutcomeProfile.value) : null
)
const releaseOptions = computed(() => analysis.value?.releaseOptions || [])
const epicFieldsAvailable = computed(() => analysis.value?.hasEpicFields === true)

const result = computed(() => {
  if (!analysis.value || !selectedVersion.value) return null
  return buildFeatureBoard(analysis.value, dashboard.value.config, selectedVersion.value, {
    components: selectedComponents.value,
    statuses: selectedStatuses.value,
    assignees: selectedAssignees.value,
    priorities: selectedPriorities.value,
    labels: selectedLabels.value,
    matchOn: matchOn.value
  })
})

// The toolbar always renders for the Release selector; filters appear only once data is loaded.
const NO_FILTER_OPTIONS = { components: [], statuses: [], assignees: [], priorities: [], labels: [] }
const filterOptions = computed(() => (result.value && !loading.value && !error.value ? result.value.options : NO_FILTER_OPTIONS))

const featuresUnavailable = computed(() => !!featureState.value && !['supported', 'empty'].includes(featureState.value))

const NOT_SHOWN_REASONS = {
  'non-delivery': entry => `Resolution: ${entry.resolution}`,
  'no-live-source': () => 'Every UI/UX Epic has a no-work resolution',
  'no-ui': () => 'UI evidence is not applicable (no-ui)'
}

function formatDate(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

function writeReleaseParam(version) {
  nav.updateParams({ release: version || undefined }, { push: false })
}

function onSelectRelease(event) {
  selectedVersion.value = event.target.value
  releaseNotice.value = ''
  writeReleaseParam(selectedVersion.value)
}

function openFeature(key) {
  nav.navigateTo('feature-detail', {
    key,
    from: 'ui-epics-by-component',
    ...(selectedVersion.value ? { boardRelease: selectedVersion.value } : {})
  })
}

let initializeToken = 0

// Applies the URL release when valid, else the registry default. A release the user
// picks while this runs is never replaced.
async function initialize({ honorUrl }) {
  const token = ++initializeToken
  selectedVersion.value = ''
  releaseNotice.value = ''
  clearAllFilters()
  matchOn.value = 'either'
  if (!dashboard.value) {
    initializing.value = false
    return
  }

  initializing.value = true
  await Promise.all([loadFeatures(), loadRegistry(dashboard.value.projectId)])
  if (token !== initializeToken) return
  initializing.value = false
  if (selectedVersion.value) return

  // Registry versions are matched under the board's own release normalization.
  const available = (analysis.value?.releasesWithCards || []).filter(version => version !== UNSCHEDULED)
  const defaultPick = pickDefaultRelease({
    registryReleases: (registryReleases.value || []).map(release => ({
      ...release,
      fixVersions: (release.fixVersions || []).map(version => resolveReleaseOption(available, version) ?? version)
    })),
    availableVersions: available,
    today: new Date()
  })
  const requested = honorUrl ? nav.params.value?.release : null
  const requestedOption = resolveReleaseOption(releaseOptions.value, requested)
  let next = defaultPick.version || ''
  if (requestedOption) {
    next = requestedOption
  } else if (requested) {
    releaseNotice.value = `Release ${requested} is not available for this project; showing the default instead.`
  }
  selectedVersion.value = next
  writeReleaseParam(next)
}

watch(selectedVersion, clearAllFilters)

watch(() => nav.params.value?.release, (requested) => {
  const option = resolveReleaseOption(releaseOptions.value, requested)
  if (option && option !== selectedVersion.value) selectedVersion.value = option
})

watch(projectId, () => {
  writeReleaseParam(null)
  initialize({ honorUrl: false })
}, { flush: 'sync' })

onMounted(() => initialize({ honorUrl: true }))

onBeforeUnmount(() => {
  initializeToken += 1
})
</script>

<template>
  <div v-if="!dashboard" class="text-center py-12 text-gray-500 dark:text-gray-400">
    UI/UX by Component is not available for this project.
  </div>

  <div v-else class="space-y-6">
    <div
      v-if="featuresUnavailable && features.length > 0"
      role="status"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ featureMessage || 'The Feature inventory is partial or unavailable; review the visible details before interpreting it.' }}
    </div>

    <div
      v-if="releaseNotice"
      role="status"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ releaseNotice }}
    </div>

    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">UI/UX by Component</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ dashboard.config.scopeDescription }}</p>
    </div>

    <ComponentStatusFilterBar
      :component-options="filterOptions.components"
      :status-options="filterOptions.statuses"
      :assignee-options="filterOptions.assignees"
      :priority-options="filterOptions.priorities"
      :label-options="filterOptions.labels"
      :selected-components="selectedComponents"
      :selected-statuses="selectedStatuses"
      :selected-assignees="selectedAssignees"
      :selected-priorities="selectedPriorities"
      :selected-labels="selectedLabels"
      :me-assignee="meAssignee"
      @toggle-component="toggleComponent"
      @toggle-status="toggleStatus"
      @toggle-assignee="toggleAssignee"
      @toggle-priority="togglePriority"
      @toggle-label="toggleLabel"
      @set-assignee-me="selectMeAssignee"
      @clear="clearAllFilters"
    >
      <template #leading>
        <div class="flex flex-col gap-0.5 min-w-0 max-w-full">
          <label for="ui-ux-board-release" class="text-xs font-medium text-gray-600 dark:text-gray-400">Release</label>
          <select
            id="ui-ux-board-release"
            :value="selectedVersion"
            class="min-w-0 cursor-pointer text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            @change="onSelectRelease"
          >
            <option v-if="!selectedVersion" value="">{{ releaseOptions.length === 0 ? 'No releases available' : 'Select a release' }}</option>
            <option v-for="version in releaseOptions" :key="version" :value="version">{{ version }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-0.5 min-w-0 max-w-full">
          <label for="ui-ux-board-match-on" class="text-xs font-medium text-gray-600 dark:text-gray-400">Match status, assignee, priority on</label>
          <select
            id="ui-ux-board-match-on"
            v-model="matchOn"
            :disabled="!epicFieldsAvailable"
            class="min-w-0 cursor-pointer text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="either" :disabled="!epicFieldsAvailable">Feature or Epics</option>
            <option value="feature">Feature</option>
            <option value="epics" :disabled="!epicFieldsAvailable">Epics</option>
          </select>
        </div>
      </template>
    </ComponentStatusFilterBar>

    <p
      v-if="result && !epicFieldsAvailable && !loading"
      role="status"
      data-testid="epic-fields-note"
      class="text-xs text-gray-500 dark:text-gray-400"
    >
      This data does not carry Epic status, assignee or priority yet, so those filters match the Feature only.
    </p>

    <div v-if="error" role="alert" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="loading || initializing" role="status" class="space-y-4 animate-pulse" data-testid="loading-skeleton">
      <span class="sr-only">Loading Features{{ selectedVersion ? ' for ' + selectedVersion : '' }}...</span>
      <div v-for="n in 3" :key="n" class="h-28 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
    </div>

    <template v-else>
      <div v-if="!selectedVersion" class="text-center py-12 text-gray-500 dark:text-gray-400">
        Select a release to view its Features by component.
        <span v-if="registryError" class="block mt-1 text-xs">The release schedule could not be loaded, so no default release was chosen.</span>
      </div>

      <div
        v-else-if="featuresUnavailable && features.length === 0"
        role="status"
        class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300"
      >
        {{ featureMessage || 'Feature inventory unavailable.' }}
      </div>

      <template v-else-if="result && !error">
        <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          <span data-testid="summary-counts">{{ result.distinctFeatureCount }} Feature{{ result.distinctFeatureCount === 1 ? '' : 's' }} &middot; {{ result.rowCount }} row{{ result.rowCount === 1 ? '' : 's' }}</span>
          <span v-if="fetchedAt" data-testid="fetched-at" class="text-xs text-gray-500 dark:text-gray-400">Data as of {{ formatDate(fetchedAt) }}</span>
        </div>

        <p v-if="result.rowCount === 0" class="text-sm text-gray-500 dark:text-gray-400" data-testid="no-features-note">
          {{ isFiltered ? 'No Features match the current filters.' : `No matching Features for release ${selectedVersion}.` }}
        </p>

        <div class="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,44rem),1fr))]">
          <FeatureComponentPanel
            v-for="panel in result.panels"
            :key="panel.id"
            :component="panel.component"
            :cards="panel.cards"
            :member-count="panel.memberCount"
            @open-feature="openFeature"
          />
        </div>

        <details v-if="result.notShown.length > 0" data-testid="not-shown" class="text-sm text-gray-600 dark:text-gray-400">
          <summary class="cursor-pointer font-medium">Not shown ({{ result.notShown.length }})</summary>
          <ul class="mt-2 space-y-1">
            <li v-for="entry in result.notShown" :key="entry.key" data-testid="not-shown-entry">
              <a :href="JIRA_BASE + entry.key" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold">{{ entry.key }}</a>
              <span class="ml-2">{{ entry.summary }}</span>
              <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">{{ NOT_SHOWN_REASONS[entry.reason](entry) }}</span>
            </li>
          </ul>
        </details>
      </template>
    </template>
  </div>
</template>
