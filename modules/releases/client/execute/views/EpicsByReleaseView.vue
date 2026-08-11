<script setup>
import { ref, watch, onMounted } from 'vue'
import { useVersions, useEpicsByRelease } from '../composables/useFeatureTraffic'
import StatusBadge from '../components/StatusBadge.vue'
import EpicBreakdown from '../components/EpicBreakdown.vue'

const { versions, loadVersions } = useVersions()
const { features, fetchedAt, loading, error, loadEpicsByRelease } = useEpicsByRelease()

const selectedVersion = ref('')

function formatDate(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

watch(selectedVersion, (v) => {
  loadEpicsByRelease(v)
})

onMounted(async () => {
  await loadVersions()
  if (versions.value.length > 0 && !selectedVersion.value) {
    selectedVersion.value = versions.value[0]
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Epics by Release</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Release &rarr; Feature &rarr; Epics, grouped by the Feature's Fix Version
          <span v-if="fetchedAt" class="ml-2">&middot; Data from {{ formatDate(fetchedAt) }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <label for="epics-by-release-version" class="text-sm font-medium text-gray-700 dark:text-gray-300">Release:</label>
        <select
          id="epics-by-release-version"
          v-model="selectedVersion"
          class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option v-if="versions.length === 0" value="">No releases available</option>
          <option v-for="v in versions" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading epics for {{ selectedVersion }}...
    </div>

    <template v-else>
      <div v-if="!selectedVersion" class="text-center py-12 text-gray-500 dark:text-gray-400">
        Select a release to view its Features and Epics.
      </div>

      <div v-else-if="features.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No Features found for release {{ selectedVersion }}.
      </div>

      <div v-else class="space-y-5">
        <div
          v-for="feature in features"
          :key="feature.key"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <!-- Feature header -->
          <div class="px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <a
                :href="'https://redhat.atlassian.net/browse/' + feature.key"
                target="_blank"
                class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold flex-shrink-0"
              >{{ feature.key }}</a>
              <StatusBadge :status="feature.status" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ feature.summary }}</h3>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span
                v-for="v in feature.fixVersions"
                :key="v"
                class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400"
              >{{ v }}</span>
            </div>
          </div>

          <div class="p-3">
            <EpicBreakdown :epics="feature.epics" show-provenance />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
