<template>
  <div>
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex -mb-px px-4" aria-label="Execute sub-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>
    <div class="p-6">
      <OverviewView v-if="activeTab === 'feature-list'" />
      <FeatureTrackingView v-else-if="activeTab === 'feature-tracking'" />
      <EpicsByReleaseView v-else-if="activeTab === 'epics-by-release'" />
      <UiUxByComponentView v-else-if="activeTab === 'ui-epics-by-component'" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, inject } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import OverviewView from '../execute/views/OverviewView.vue'
import FeatureTrackingView from '../execute/views/FeatureTrackingView.vue'
import EpicsByReleaseView from '../execute/views/EpicsByReleaseView.vue'
import UiUxByComponentView from '../execute/views/UiUxByComponentView.vue'
import { resolveComponentDashboard } from '../execute/utils/componentDashboardConfig'

const nav = inject('moduleNav')
// `projectIds` limits a tab to the listed projects (an unresolved project lists every tab).
// It is a product-exposure choice, not a statement about what the tab's APIs support.
const ALL_TABS = [
  { id: 'feature-list', label: 'Feature List' },
  { id: 'feature-tracking', label: 'Feature Tracking', projectIds: ['osac'] },
  { id: 'epics-by-release', label: 'Epics by Release', projectIds: ['osac'] },
  { id: 'ui-epics-by-component', label: 'UI/UX by Component', requiresComponentDashboard: true },
]

const projectId = useProjectId()
const hasComponentDashboard = computed(() => resolveComponentDashboard(projectId.value) !== null)
const tabs = computed(() => ALL_TABS.filter(tab =>
  (!tab.requiresComponentDashboard || hasComponentDashboard.value)
  && (!tab.projectIds || !projectId.value || tab.projectIds.includes(projectId.value))
))
const validTabs = computed(() => tabs.value.map(tab => tab.id))
const DEFAULT_TAB = 'feature-list'
const RELEASE_TAB = 'ui-epics-by-component'
const activeTab = ref(DEFAULT_TAB)

let updatingFromUrl = false

watch(activeTab, (tab) => {
  // `release` belongs to the UI/UX by Component tab; changing tabs clears it in the same URL update.
  if (!updatingFromUrl) nav.updateParams({ tab: tab === DEFAULT_TAB ? undefined : tab, release: undefined })
})

watch([() => nav.params.value?.tab, validTabs], ([tabParam]) => {
  const tab = tabParam && validTabs.value.includes(tabParam) ? tabParam : DEFAULT_TAB
  // A `release` left in a URL that resolves to another tab is dropped in place (no history entry).
  if (tab !== RELEASE_TAB && nav.params.value?.release !== undefined) {
    nav.updateParams({ release: undefined }, { push: false })
  }
  if (activeTab.value !== tab) {
    updatingFromUrl = true
    activeTab.value = tab
    nextTick(() => { updatingFromUrl = false })
  }
}, { immediate: true })
</script>
