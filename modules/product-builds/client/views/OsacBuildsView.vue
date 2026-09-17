<template>
  <div class="max-w-4xl mx-auto px-4 py-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">OSAC</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Published CI builds — nightly and release.</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-40"></div>
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-16"></div>
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
      {{ error }}
      <button class="ml-2 underline" @click="loadBuilds">Retry</button>
    </div>

    <div v-else-if="!latestBuild" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No builds published yet.
    </div>

    <template v-else>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Latest published build</div>

        <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div class="flex flex-wrap items-center gap-3">
            <span :class="modeBadgeClasses(latestBuild.mode)" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border">
              {{ modeLabel(latestBuild.mode) }}
            </span>
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ latestBuild.version }}</span>
            <span class="text-sm text-gray-500 dark:text-gray-400">{{ formatDate(latestBuild.publishedAt) }}</span>
            <span v-if="latestBuild.e2eSkipped" :class="E2E_BADGE_CLASSES" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border">
              E2E skipped
            </span>
          </div>
          <a
            :href="latestBuild.runUrl" target="_blank" rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            GitHub Actions run
            <ExternalLinkIcon :size="14" />
          </a>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t border-gray-100 dark:border-gray-700/60 text-sm">
          <div>
            <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Charts</div>
            <div v-if="latestBuild.charts?.length" class="divide-y divide-gray-100 dark:divide-gray-700/50">
              <div v-for="chart in latestBuild.charts" :key="chart.name" class="flex items-center justify-between gap-4 py-1.5">
                <span class="font-medium text-gray-800 dark:text-gray-200">{{ chart.name }}</span>
                <span class="text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{{ chart.version }}</span>
              </div>
            </div>
            <div v-else class="text-gray-400 dark:text-gray-500">No charts published.</div>
          </div>
          <div>
            <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Images</div>
            <div v-if="latestBuild.images?.length" class="space-y-1.5">
              <div
                v-for="image in latestBuild.images" :key="image"
                class="font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-400 break-all"
              >
                {{ image }}
              </div>
            </div>
            <div v-else class="text-gray-400 dark:text-gray-500">No images published.</div>
          </div>
        </div>
      </div>

      <div>
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Build history</h2>
        <div v-if="historyBuilds.length === 0" class="text-sm text-gray-500 dark:text-gray-400">No previous builds.</div>
        <div v-else class="space-y-3">
          <div
            v-for="build in historyBuilds" :key="build.runId"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div
              class="px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30"
              @click="toggleBuild(build.runId)"
            >
              <ChevronDownIcon
                :size="14" class="text-gray-400 transition-transform shrink-0"
                :class="{ 'rotate-180': expandedBuilds.has(build.runId) }"
              />
              <span :class="modeBadgeClasses(build.mode)" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0">
                {{ modeLabel(build.mode) }}
              </span>
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ build.version }}</span>
              <span v-if="build.e2eSkipped" :class="E2E_BADGE_CLASSES" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0">
                E2E skipped
              </span>
              <span class="ml-auto text-xs text-gray-400 dark:text-gray-500 tabular-nums">{{ formatDate(build.publishedAt) }}</span>
            </div>
            <div
              v-if="expandedBuilds.has(build.runId)"
              class="px-4 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-sm"
            >
              <a
                :href="build.runUrl" target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 hover:underline mb-4"
              >
                GitHub Actions run
                <ExternalLinkIcon :size="14" />
              </a>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Charts</div>
                  <div v-if="build.charts?.length" class="divide-y divide-gray-100 dark:divide-gray-700/50">
                    <div v-for="chart in build.charts" :key="chart.name" class="flex items-center justify-between gap-4 py-1.5">
                      <span class="font-medium text-gray-800 dark:text-gray-200">{{ chart.name }}</span>
                      <span class="text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{{ chart.version }}</span>
                    </div>
                  </div>
                  <div v-else class="text-gray-400 dark:text-gray-500">No charts published.</div>
                </div>
                <div>
                  <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Images</div>
                  <div v-if="build.images?.length" class="space-y-1.5">
                    <div
                      v-for="image in build.images" :key="image"
                      class="font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-400 break-all"
                    >
                      {{ image }}
                    </div>
                  </div>
                  <div v-else class="text-gray-400 dark:text-gray-500">No images published.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ExternalLinkIcon, ChevronDownIcon } from 'lucide-vue-next'
import { apiRequest } from '@shared/client/services/api.js'

const E2E_BADGE_CLASSES = 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30'

const builds = ref([])
const loading = ref(true)
const error = ref(null)
const expandedBuilds = ref(new Set())

async function loadBuilds() {
  loading.value = true
  error.value = null
  try {
    const data = await apiRequest('/modules/product-builds/osac/builds')
    builds.value = data.builds || []
  } catch (e) {
    error.value = e.message || 'Failed to load OSAC builds'
  } finally {
    loading.value = false
  }
}
loadBuilds()

const sortedBuilds = computed(() =>
  [...builds.value].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
)
const latestBuild = computed(() => sortedBuilds.value[0] || null)
const historyBuilds = computed(() => sortedBuilds.value.slice(1))

function toggleBuild(runId) {
  const next = new Set(expandedBuilds.value)
  if (next.has(runId)) next.delete(runId)
  else next.add(runId)
  expandedBuilds.value = next
}

function modeLabel(mode) {
  return mode === 'release' ? 'Release' : 'Nightly'
}

function modeBadgeClasses(mode) {
  return mode === 'release'
    ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-500/30'
    : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30'
}

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}
</script>
