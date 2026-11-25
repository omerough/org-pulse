<script setup>
import { ref, computed, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import UiUxStatusBadge from './UiUxStatusBadge.vue'
import { componentDisplayLabel, assigneeDisplayLabel } from '../composables/useComponentStatusFilter'

const props = defineProps({
  component: { type: String, required: true },
  cards: { type: Array, required: true },
  memberCount: { type: Number, default: null },
  pageSize: { type: Number, default: 10 }
})

const emit = defineEmits(['open-feature'])

const JIRA_BASE = 'https://redhat.atlassian.net/browse/'

const EPIC_TYPE_LABELS = { bootstrap: 'Bootstrap', uix: 'UIX', 'ui-impl': 'UI impl' }
const LOCAL_STATUS_LABELS = {
  'not-applicable': 'N/A', unknown: 'Unknown', 'not-started': 'Not Started', design: 'Design',
  'in-progress': 'In Progress', completed: 'Completed'
}
const NO_WORK_HELP = 'No-work resolution: counted in the rollup by current collector semantics.'

const isEmpty = computed(() => props.cards.length === 0)
// A user's toggle overrides the default (empty panels start collapsed) across data and filter changes.
const userCollapsed = ref(null)
const collapsed = computed(() => userCollapsed.value ?? isEmpty.value)
const showAll = ref(false)

// Reset paging only when the listed Features change, not when the array is rebuilt with the same content.
watch(() => props.cards.map(card => card.key).join('\n'), () => { showAll.value = false })

const visibleCards = computed(() => showAll.value ? props.cards : props.cards.slice(0, props.pageSize))
const hiddenCount = computed(() => props.cards.length - visibleCards.value.length)
const isNarrowed = computed(() => props.memberCount !== null && props.memberCount !== props.cards.length)
const contentId = computed(() => 'feature-panel-' + props.component.replace(/[^a-z0-9]+/gi, '-').toLowerCase())

function alsoInText(alsoIn) {
  return 'also in: ' + alsoIn.map(componentDisplayLabel).join(', ')
}

function localStatus(source) {
  const parts = []
  if (source.ux !== null) parts.push(`UX ${LOCAL_STATUS_LABELS[source.ux] || source.ux}`)
  if (source.ui !== null) parts.push(`UI ${LOCAL_STATUS_LABELS[source.ui] || source.ui}`)
  return parts.join(' · ')
}

function matchedViaText(via) {
  return [...(via.feature ? ['Feature'] : []), ...via.epics].join(', ')
}
</script>

<template>
  <section
    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-t-4 border-t-purple-500 overflow-hidden"
    :class="{ 'opacity-70': isEmpty }"
    :data-panel="component"
  >
    <h3>
      <button
        type="button"
        class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
        :aria-expanded="!collapsed"
        :aria-controls="contentId"
        @click="userCollapsed = !collapsed"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ componentDisplayLabel(component) }}</span>
          <span
            data-testid="panel-count"
            class="inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          >{{ isNarrowed ? `${cards.length} of ${memberCount}` : cards.length }}</span>
        </span>
        <svg
          class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform"
          :class="{ '-rotate-90': collapsed }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
    </h3>

    <div v-show="!collapsed" :id="contentId" class="border-t border-gray-100 dark:border-gray-700/60">
      <p v-if="isEmpty" class="px-4 py-4 text-sm italic text-gray-500 dark:text-gray-400">No matching Features</p>

      <template v-else>
        <ul class="divide-y divide-gray-100 dark:divide-gray-700/60">
          <li v-for="card in visibleCards" :key="card.key" data-testid="feature-card" class="px-4 py-3 space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <a :href="JIRA_BASE + card.key" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold">{{ card.key }}</a>
              <button
                type="button"
                data-testid="open-feature"
                class="text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                @click="emit('open-feature', card.key)"
              >Details</button>
              <StatusBadge :status="card.status" />
              <span class="text-xs" :class="card.priority && card.priority !== 'Undefined' ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'">{{ card.priority || 'Undefined' }}</span>
              <span class="text-xs" :class="card.assignee ? 'text-gray-700 dark:text-gray-300' : 'italic text-gray-500 dark:text-gray-400'">{{ card.assignee || 'Unassigned' }}</span>
              <span class="ml-auto inline-flex items-center gap-3">
                <UiUxStatusBadge label="UX" :status="card.ux.status" :conflict="card.ux.conflict" data-testid="ux-badge" />
                <UiUxStatusBadge label="UI" :status="card.ui.status" :conflict="card.ui.conflict" data-testid="ui-badge" />
              </span>
            </div>

            <p class="text-sm text-gray-900 dark:text-gray-100">{{ card.summary }}</p>

            <div class="flex flex-wrap items-center gap-1">
              <span v-for="label in card.labels" :key="label" data-testid="feature-label" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400">{{ label }}</span>
              <span v-if="card.alsoIn.length > 0" data-testid="also-in" class="text-[10px] text-gray-500 dark:text-gray-400">{{ alsoInText(card.alsoIn) }}</span>
              <span
                v-if="card.otherReason"
                data-testid="other-reason"
                class="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
              >{{ card.otherReason }}</span>
              <span
                v-if="card.matchedVia"
                data-testid="matched-via"
                class="px-2 py-0.5 rounded text-[10px] font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
              >Matched via {{ matchedViaText(card.matchedVia) }}</span>
            </div>

            <ul class="space-y-1 border-l-2 border-gray-100 dark:border-gray-700 pl-3">
              <li
                v-for="source in card.sources"
                :key="source.epicKey"
                data-testid="source-row"
                class="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xs rounded px-1"
                :class="{ 'bg-primary-50 dark:bg-primary-900/20': source.matched, 'opacity-70': source.noWork }"
                :data-matched="source.matched ? 'true' : undefined"
              >
                <a :href="JIRA_BASE + source.epicKey" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono font-semibold">{{ source.epicKey }}</a>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">{{ EPIC_TYPE_LABELS[source.epicType] || source.epicType }}</span>
                <StatusBadge v-if="source.status" :status="source.status" />
                <span v-if="source.priority" class="text-gray-600 dark:text-gray-400">{{ source.priority }}</span>
                <span v-if="source.status !== undefined" :class="source.assignee ? 'text-gray-600 dark:text-gray-400' : 'italic text-gray-500 dark:text-gray-400'">{{ assigneeDisplayLabel(source.assignee) || 'Unassigned' }}</span>
                <span class="text-gray-700 dark:text-gray-300" data-testid="source-local-status">{{ localStatus(source) }}</span>
                <span v-if="source.fixVersions.length > 0" class="text-gray-500 dark:text-gray-400">{{ source.fixVersions.join(', ') }}</span>
                <span
                  v-if="source.noWork"
                  data-testid="no-work-chip"
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  :title="NO_WORK_HELP"
                >{{ source.resolution }}</span>
              </li>
            </ul>
          </li>
        </ul>

        <div v-if="cards.length > pageSize" class="px-4 py-2 border-t border-gray-100 dark:border-gray-700/60">
          <button
            type="button"
            data-testid="show-more-toggle"
            class="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
            @click="showAll = !showAll"
          >{{ showAll ? 'Show fewer' : `Show ${hiddenCount} more` }}</button>
        </div>
      </template>
    </div>
  </section>
</template>
