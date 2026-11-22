<template>
  <div class="max-w-5xl mx-auto py-6 px-4">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Release Schedule</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Milestone dates sourced from Jira release versions
        </p>
      </div>
      <button
        @click="fetchRegistry"
        :disabled="loading"
        class="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !releases.length" class="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
      Loading schedule...
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700/50"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Failed to load schedule</h3>
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button
        @click="fetchRegistry"
        class="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >Try again</button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!releases.length"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No releases found</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        The release registry is empty.
      </p>
    </div>

    <template v-else>
      <!-- Next milestone banner -->
      <div
        v-if="globalNextMilestone"
        class="mb-5 rounded-lg border px-4 py-3 flex items-center justify-between"
        :class="globalNextMilestone.days <= 7
          ? 'border-blue-200 dark:border-blue-700/50 bg-blue-50/80 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'"
      >
        <div class="flex items-center gap-3">
          <span
            class="inline-flex h-2.5 w-2.5 rounded-full shrink-0"
            :class="globalNextMilestone.days <= 7
              ? 'bg-blue-500 animate-pulse'
              : 'bg-gray-400 dark:bg-gray-500'"
          ></span>
          <span class="text-sm text-gray-900 dark:text-gray-100">
            <span class="font-medium">{{ globalNextMilestone.releaseName }}</span>
            <span class="text-gray-500 dark:text-gray-400"> · {{ globalNextMilestone.label }}</span>
          </span>
        </div>
        <span
          class="text-sm font-semibold tabular-nums"
          :class="globalNextMilestone.days <= 7
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-300'"
        >
          {{ globalNextMilestone.days === 0 ? 'Today' : globalNextMilestone.days + 'd' }}
        </span>
      </div>

      <div v-if="products.length > 1 || archivedCount" class="flex flex-wrap items-center gap-2 mb-5">
        <!-- Product filter -->
        <template v-if="products.length > 1">
          <button
            @click="selectedProduct = null"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            :class="!activeProduct
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600'"
          >All</button>
          <button
            v-for="p in products"
            :key="p"
            @click="selectedProduct = p"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            :class="activeProduct === p
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600'"
          >{{ p }}</button>
        </template>
        <label
          v-if="archivedCount"
          class="ml-auto inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer"
        >
          <input v-model="showArchived" type="checkbox" class="rounded border-gray-300 dark:border-gray-600" />
          Show archived ({{ archivedCount }})
        </label>
      </div>

      <div
        v-if="!allSortedReleases.length"
        class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400"
      >
        No releases to show. Archived versions and release candidates are hidden.
      </div>

      <p
        v-if="hasInferredStatus"
        class="mb-3 text-xs text-gray-500 dark:text-gray-400"
        data-testid="inferred-status-note"
      >
        Status is inferred from milestone dates because Jira's released flag is not reliably maintained for this
        project. Dashed badges are inferred; solid badges are confirmed by Jira.
      </p>

      <!-- Releases table -->
      <div v-if="allSortedReleases.length" class="bg-white dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Release</th>
                <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th v-if="hasReleaseStart" class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Release Start</th>
                <th v-if="hasCodeFreeze" class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code Freeze</th>
                <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Release Date</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in allSortedReleases"
                :key="r.id"
                class="border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                :class="isReleased(r) ? 'opacity-75' : nextMilestoneUrgencyRow(r)"
              >
                <td class="px-4 py-3">
                  <a
                    v-if="releaseJiraUrl(r)"
                    :href="releaseJiraUrl(r)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 hover:underline"
                    :title="`Open ${r.displayName || r.id} in Jira`"
                  >{{ r.displayName || r.id }}</a>
                  <span v-else class="font-semibold text-gray-900 dark:text-gray-100">{{ r.displayName || r.id }}</span>
                </td>
                <td class="px-4 py-3">
                  <span
                    v-if="statusBadge(r)"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
                    :class="statusBadge(r).class"
                    :title="statusBadge(r).title"
                  >{{ statusBadge(r).text }}</span>
                  <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                </td>
                <td v-if="hasReleaseStart" class="px-4 py-3">
                  <MilestoneCell :date="getReleaseStartDate(r)" :muted="isReleased(r)" />
                </td>
                <td v-if="hasCodeFreeze" class="px-4 py-3">
                  <MilestoneCell :date="r.milestones?.codeFreeze" :muted="isReleased(r)" />
                </td>
                <td class="px-4 py-3">
                  <MilestoneCell :date="r.milestones?.ga" :muted="isReleased(r)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, h } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'
import {
  STATUS_LABELS,
  compareReleasesNewestFirst,
  isReleaseCandidate,
  releaseJiraUrl,
  releaseStatus
} from '../utils/releaseSchedule.js'

// ── Data ──

const releases = ref([])
const loading = ref(true)
const error = ref(null)
const selectedProduct = ref(null)
const showArchived = ref(false)

// Only the latest request may publish results, and `releases` always belong to
// `releasesProjectId`, so a slow response never shows another project's data.
let latestRequestId = 0
let releasesProjectId = null

async function fetchRegistry() {
  const requestId = ++latestRequestId
  const projectId = useProjectId().value
  if (projectId !== releasesProjectId) {
    releases.value = []
    releasesProjectId = projectId
  }
  loading.value = true
  error.value = null
  try {
    const data = await apiRequest(`/modules/releases/registry${projectQuery(projectId)}`)
    if (requestId !== latestRequestId) return
    releases.value = data.releases || []
  } catch (e) {
    if (requestId !== latestRequestId) return
    error.value = e.message || 'Failed to load schedule data'
    console.error('[schedule] Failed to fetch registry:', e)
  } finally {
    if (requestId === latestRequestId) loading.value = false
  }
}

onMounted(fetchRegistry)

// Re-fetch when the project context changes
watch(useProjectId(), () => fetchRegistry())

// ── Helpers ──

function parseDate(val) {
  if (!val) return null
  // Bare YYYY-MM-DD registry milestones must land on that calendar day locally;
  // new Date('YYYY-MM-DD') parses as UTC midnight, which renders a day early
  // west of UTC.
  const bareDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val)
  if (bareDate) {
    const [, year, month, day] = bareDate
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

function todayMidnight() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function daysFromNow(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return null
  const today = todayMidnight()
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

function formatShort(dateStr) {
  const d = parseDate(dateStr)
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getProduct(release) {
  if (release.productPagesShortname) return release.productPagesShortname
  const match = release.id.match(/^([a-z]+)-/)
  return match ? match[1] : release.id
}

function getGaDate(release) {
  return release.milestones?.ga || null
}

// releaseStart is the current contract; planningFreeze is the deployed-but-deprecated
// Registry field name it replaces. Fall back until org-pulse-data's CP5 migration lands.
function getReleaseStartDate(release) {
  const ms = release.milestones || {}
  return ms.releaseStart || ms.planningFreeze || null
}

function nextMilestone(release) {
  const ms = release.milestones || {}
  const milestones = [
    { key: 'releaseStart', label: 'Release Start', date: getReleaseStartDate(release) },
    { key: 'codeFreeze', label: 'Code Freeze', date: ms.codeFreeze },
    { key: 'ga', label: 'Release Date', date: ms.ga }
  ]
  for (let i = 0; i < milestones.length; i++) {
    const days = daysFromNow(milestones[i].date)
    if (days !== null && days >= 0) {
      return { label: milestones[i].label, type: milestones[i].key, days }
    }
  }
  return null
}

// ── Computed ──

// Release candidates stay in the registry but are never scheduled here.
const scheduledReleases = computed(() => releases.value.filter(r => !isReleaseCandidate(r)))

const archivedCount = computed(() => scheduledReleases.value.filter(r => r.state === 'archived').length)

const listedReleases = computed(() =>
  showArchived.value ? scheduledReleases.value : scheduledReleases.value.filter(r => r.state !== 'archived')
)

const products = computed(() => {
  const set = {}
  for (let i = 0; i < listedReleases.value.length; i++) {
    set[getProduct(listedReleases.value[i])] = true
  }
  return Object.keys(set).sort()
})

const activeProduct = computed(() => (products.value.includes(selectedProduct.value) ? selectedProduct.value : null))

const allSortedReleases = computed(() => {
  const filtered = activeProduct.value
    ? listedReleases.value.filter(r => getProduct(r) === activeProduct.value)
    : listedReleases.value
  return filtered.slice().sort((a, b) =>
    getProduct(a).localeCompare(getProduct(b)) || compareReleasesNewestFirst(a, b)
  )
})

const hasCodeFreeze = computed(() => allSortedReleases.value.some(r => r.milestones?.codeFreeze))

// Mirrors the cell's own value (including the planningFreeze alias); nothing is derived.
const hasReleaseStart = computed(() => allSortedReleases.value.some(r => getReleaseStartDate(r)))

const hasInferredStatus = computed(() =>
  allSortedReleases.value.some(r => {
    const status = releaseStatus(r)
    return status !== null && !status.confirmed
  })
)

// Archived rows shown via the toggle are history, not upcoming work.
const globalNextMilestone = computed(() => {
  let best = null
  for (let i = 0; i < allSortedReleases.value.length; i++) {
    const r = allSortedReleases.value[i]
    if (r.state === 'archived') continue
    const nm = nextMilestone(r)
    if (nm && (best === null || nm.days < best.days)) {
      best = { releaseName: r.displayName || r.id, label: nm.label, type: nm.type, days: nm.days }
    }
  }
  return best
})

function isReleased(release) {
  const status = releaseStatus(release)
  if (status) return status.key === 'released'
  const ga = getGaDate(release)
  if (!ga) return false
  const days = daysFromNow(ga)
  return days !== null && days < 0
}

const STATUS_CLASSES = {
  released: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/50',
  'in-progress': 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/50'
}
const DEFAULT_STATUS_CLASS = 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'

// Inferred statuses come from milestone dates, not from Jira's released flag;
// they are drawn with a dashed border and explained once by the table note.
function statusBadge(release) {
  const status = releaseStatus(release)
  if (!status) return null
  const label = STATUS_LABELS[status.key] || status.key
  return status.confirmed
    ? { text: label, class: STATUS_CLASSES[status.key] || DEFAULT_STATUS_CLASS, title: 'Confirmed by Jira' }
    : {
        text: label,
        class: `${STATUS_CLASSES[status.key] || DEFAULT_STATUS_CLASS} border-dashed`,
        title: 'Inferred from milestone dates'
      }
}

function nextMilestoneUrgencyRow(release) {
  const nm = nextMilestone(release)
  if (!nm) return ''
  if (nm.days <= 7) return 'bg-blue-50/50 dark:bg-blue-900/10'
  return ''
}

// ── Inline sub-components ──

const MilestoneCell = {
  props: {
    date: { type: String, default: null },
    muted: { type: Boolean, default: false }
  },
  setup(props) {
    return () => {
      if (!props.date) {
        return h('span', { class: 'text-gray-300 dark:text-gray-600' }, '—')
      }
      const days = daysFromNow(props.date)
      const dateLabel = formatShort(props.date)

      const dateClass = props.muted
        ? 'text-gray-600 dark:text-gray-300'
        : 'text-gray-900 dark:text-gray-100'

      let countdownEl = null
      if (days !== null) {
        let countdownClass = 'text-[11px] tabular-nums '
        if (props.muted) {
          countdownClass += 'text-gray-500 dark:text-gray-400'
        } else if (days < 0) {
          countdownClass += 'text-gray-400 dark:text-gray-500'
        } else if (days === 0) {
          countdownClass += 'font-semibold text-blue-600 dark:text-blue-400'
        } else if (days <= 7) {
          countdownClass += 'font-medium text-blue-600 dark:text-blue-400'
        } else if (days <= 14) {
          countdownClass += 'text-blue-500 dark:text-blue-400'
        } else {
          countdownClass += 'text-gray-400 dark:text-gray-500'
        }

        let countdownText
        if (days < 0) countdownText = Math.abs(days) + 'd ago'
        else if (days === 0) countdownText = 'Today'
        else countdownText = days + 'd'

        countdownEl = h('span', { class: countdownClass }, countdownText)
      }

      return h('div', { class: 'flex flex-col' }, [
        h('span', { class: 'text-sm tabular-nums ' + dateClass }, dateLabel),
        countdownEl
      ])
    }
  }
}
</script>
