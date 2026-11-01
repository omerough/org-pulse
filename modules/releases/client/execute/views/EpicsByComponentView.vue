<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { useVersions, useEpicsByRelease } from '../composables/useFeatureTraffic'
import { useReleaseRegistry } from '../composables/useReleaseRegistry'
import { useComponentStatusFilter } from '../composables/useComponentStatusFilter'
import { resolveComponentDashboard } from '../utils/componentDashboardConfig'
import { buildComponentPanels } from '../utils/epicComponentPanels'
import { pickDefaultRelease } from '../utils/releaseDefault'
import ComponentStatusFilterBar from '../components/ComponentStatusFilterBar.vue'
import EpicComponentPanel from '../components/EpicComponentPanel.vue'

const nav = inject('moduleNav')
const projectId = useProjectId()
const dashboard = computed(() => resolveComponentDashboard(projectId.value))

const { versions, state: versionState, message: versionMessage, loadVersions } = useVersions()
const { releases: registryReleases, error: registryError, loadRegistry } = useReleaseRegistry()
const { features, fetchedAt, loading, error, state: treeState, message: treeMessage, loadEpicsByRelease } = useEpicsByRelease()
const {
  selectedComponents,
  selectedStatuses,
  selectedAssignees,
  toggleComponent,
  toggleStatus,
  toggleAssignee,
  setAssignees
} = useComponentStatusFilter()
const selectedLabels = ref([])

const { user } = useAuth()
// Hidden when no reliable jiraDisplayName is resolved for the current user — never guessed client-side.
const meAssignee = computed(() => user.value?.jiraDisplayName || null)

const selectedVersion = ref('')
const releaseNotice = ref('')
const initializing = ref(false)

const isFiltered = computed(() =>
  selectedComponents.value.length > 0 || selectedStatuses.value.length > 0 ||
  selectedAssignees.value.length > 0 || selectedLabels.value.length > 0
)

function clearAllFilters() {
  selectedComponents.value = []
  selectedStatuses.value = []
  selectedAssignees.value = []
  selectedLabels.value = []
}

function toggleLabel(label) {
  const index = selectedLabels.value.indexOf(label)
  if (index >= 0) selectedLabels.value.splice(index, 1)
  else selectedLabels.value.push(label)
}

function selectMeAssignee() {
  if (meAssignee.value) setAssignees([meAssignee.value])
}

const result = computed(() => {
  if (!dashboard.value || !selectedVersion.value) return null
  return buildComponentPanels(features.value, dashboard.value.config, selectedVersion.value, {
    components: selectedComponents.value,
    statuses: selectedStatuses.value,
    assignees: selectedAssignees.value,
    labels: selectedLabels.value
  })
})

// The toolbar always renders for the Release selector; filters appear only once data is loaded.
const NO_FILTER_OPTIONS = { components: [], statuses: [], assignees: [], labels: [] }
const filterOptions = computed(() => (result.value && !loading.value && !error.value ? result.value.options : NO_FILTER_OPTIONS))

const treeUnavailable = computed(() => !!treeState.value && !['supported', 'empty'].includes(treeState.value))

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

let initializeToken = 0

// Applies the URL release when valid, else the registry default. A release the user
// picks while this runs is never replaced.
async function initialize({ honorUrl }) {
  const token = ++initializeToken
  selectedVersion.value = ''
  releaseNotice.value = ''
  clearAllFilters()
  if (!dashboard.value) {
    initializing.value = false
    return
  }

  initializing.value = true
  await Promise.all([loadVersions('epics'), loadRegistry(dashboard.value.projectId)])
  if (token !== initializeToken) return
  initializing.value = false
  if (selectedVersion.value) return

  const defaultPick = pickDefaultRelease({
    registryReleases: registryReleases.value,
    availableVersions: versions.value,
    today: new Date()
  })
  const requested = honorUrl ? nav.params.value?.release : null
  let next = defaultPick.version || ''
  if (requested && versions.value.includes(requested)) {
    next = requested
  } else if (requested) {
    releaseNotice.value = `Release ${requested} is not available for this project; showing the default instead.`
  }
  selectedVersion.value = next
  writeReleaseParam(next)
}

watch(selectedVersion, (version) => {
  clearAllFilters()
  loadEpicsByRelease(version)
})

watch(() => nav.params.value?.release, (requested) => {
  if (requested && requested !== selectedVersion.value && versions.value.includes(requested)) {
    selectedVersion.value = requested
  }
})

watch(projectId, () => {
  writeReleaseParam(null)
  initialize({ honorUrl: false })
}, { flush: 'sync' })

onMounted(() => initialize({ honorUrl: true }))

onBeforeUnmount(() => {
  initializeToken += 1
  if (nav.params.value?.release !== undefined) writeReleaseParam(null)
})
</script>

<template>
  <div v-if="!dashboard" class="text-center py-12 text-gray-500 dark:text-gray-400">
    UI Epics by Component is not available for this project.
  </div>

  <div v-else class="space-y-6">
    <div
      v-if="versionState && !['supported', 'empty'].includes(versionState)"
      role="status"
      class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-sm text-gray-600 dark:text-gray-300"
    >
      {{ versionMessage || 'Release execution versions have not been collected for this project.' }}
    </div>

    <div
      v-if="treeUnavailable && features.length > 0"
      role="status"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ treeMessage || 'The release hierarchy is partial or unavailable; review the visible details before interpreting it.' }}
    </div>

    <div
      v-if="releaseNotice"
      role="status"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300"
    >
      {{ releaseNotice }}
    </div>

    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">UI Epics by Component</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ dashboard.config.scopeDescription }}</p>
    </div>

    <ComponentStatusFilterBar
      :component-options="filterOptions.components"
      :status-options="filterOptions.statuses"
      :assignee-options="filterOptions.assignees"
      :label-options="filterOptions.labels"
      :selected-components="selectedComponents"
      :selected-statuses="selectedStatuses"
      :selected-assignees="selectedAssignees"
      :selected-labels="selectedLabels"
      :me-assignee="meAssignee"
      @toggle-component="toggleComponent"
      @toggle-status="toggleStatus"
      @toggle-assignee="toggleAssignee"
      @toggle-label="toggleLabel"
      @set-assignee-me="selectMeAssignee"
      @clear="clearAllFilters"
    >
      <template #leading>
        <div class="flex flex-col gap-0.5 min-w-0 max-w-full">
          <label for="epics-by-component-release" class="text-xs font-medium text-gray-600 dark:text-gray-400">Release</label>
          <select
            id="epics-by-component-release"
            :value="selectedVersion"
            class="min-w-0 cursor-pointer text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            @change="onSelectRelease"
          >
            <option v-if="!selectedVersion" value="">{{ versions.length === 0 ? 'No releases available' : 'Select a release' }}</option>
            <option v-for="version in versions" :key="version" :value="version">{{ version }}</option>
          </select>
        </div>
      </template>
    </ComponentStatusFilterBar>

    <div v-if="error" role="alert" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="loading || initializing" role="status" class="space-y-4 animate-pulse" data-testid="loading-skeleton">
      <span class="sr-only">Loading epics{{ selectedVersion ? ' for ' + selectedVersion : '' }}...</span>
      <div v-for="n in 3" :key="n" class="h-28 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
    </div>

    <template v-else>
      <div v-if="!selectedVersion" class="text-center py-12 text-gray-500 dark:text-gray-400">
        Select a release to view its UI Epics by component.
        <span v-if="registryError" class="block mt-1 text-xs">The release schedule could not be loaded, so no default release was chosen.</span>
      </div>

      <div
        v-else-if="treeUnavailable && features.length === 0"
        role="status"
        class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300"
      >
        {{ treeMessage || 'Release hierarchy unavailable.' }}
      </div>

      <template v-else-if="result && !error">
        <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          <span data-testid="summary-counts">{{ result.distinctEpicCount }} Epic{{ result.distinctEpicCount === 1 ? '' : 's' }} &middot; {{ result.rowCount }} row{{ result.rowCount === 1 ? '' : 's' }}</span>
          <span v-if="fetchedAt" data-testid="fetched-at" class="text-xs text-gray-500 dark:text-gray-400">Data as of {{ formatDate(fetchedAt) }}</span>
        </div>

        <p v-if="result.rowCount === 0" class="text-sm text-gray-500 dark:text-gray-400" data-testid="no-epics-note">
          {{ isFiltered ? 'No Epics match the current filters.' : `No matching Epics for release ${selectedVersion}.` }}
        </p>

        <div class="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,44rem),1fr))]">
          <EpicComponentPanel
            v-for="panel in result.panels"
            :key="panel.id"
            :component="panel.component"
            :rows="panel.rows"
            :member-count="panel.memberCount"
          />
        </div>
      </template>
    </template>
  </div>
</template>
