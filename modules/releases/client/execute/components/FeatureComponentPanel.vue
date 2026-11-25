<script setup>
import { ref, computed, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import UiUxStatusBadge from './UiUxStatusBadge.vue'
import { componentDisplayLabel, assigneeDisplayLabel } from '../composables/useComponentStatusFilter'
import { UI_UX_STATUS_LABELS } from '../utils/featureComponentBoard'

const props = defineProps({
  component: { type: String, required: true },
  cards: { type: Array, required: true },
  memberCount: { type: Number, default: null },
  pageSize: { type: Number, default: 10 },
  // Keys of the Features whose Epic table is expanded; collapsed otherwise.
  expandedKeys: { type: Object, default: () => new Set() }
})

const emit = defineEmits(['toggle-epics'])

const JIRA_BASE = 'https://redhat.atlassian.net/browse/'

const EPIC_TYPE_LABELS = { bootstrap: 'Bootstrap', uix: 'UIX', 'ui-impl': 'UI impl' }
const WORKSTREAMS = [{ id: 'ux', label: 'UX' }, { id: 'ui', label: 'UI' }]
// Hues mirror UiUxStatusBadge; neutral states get an unfilled dot so they don't read as warnings.
const STATUS_DOT_CLASSES = {
  design: 'bg-indigo-500',
  'in-progress': 'bg-blue-500',
  completed: 'bg-emerald-500',
  mixed: 'bg-amber-500'
}
const NEUTRAL_DOT_CLASS = 'border border-gray-400 dark:border-gray-500'
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

const dotClass = status => STATUS_DOT_CLASSES[status] || NEUTRAL_DOT_CLASS
const isNeutral = status => !STATUS_DOT_CLASSES[status]
const epicsId = card => `${contentId.value}-${card.key}-epics`.toLowerCase()
const matchCount = card => card.sources.filter(source => source.matched).length

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
          <li v-for="card in visibleCards" :key="card.key" data-testid="feature-card" class="px-4 py-2.5 space-y-1.5">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1 space-y-0.5">
                <a :href="JIRA_BASE + card.key" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold">{{ card.key }}</a>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ card.summary }}</p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                  <span class="inline-flex items-center gap-1.5">
                    <span class="text-gray-400 dark:text-gray-500">Status</span>
                    <StatusBadge :status="card.status" />
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="text-gray-400 dark:text-gray-500">Priority</span>
                    <span :class="card.priority && card.priority !== 'Undefined' ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'">{{ card.priority || 'Undefined' }}</span>
                  </span>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="text-gray-400 dark:text-gray-500">Assignee</span>
                    <span :class="card.assignee ? 'text-gray-700 dark:text-gray-300' : 'italic text-gray-500 dark:text-gray-400'">{{ card.assignee || 'Unassigned' }}</span>
                  </span>
                </div>
              </div>
              <div
                class="flex-shrink-0 rounded-md border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 px-2 py-1"
                data-testid="rollup"
                title="Feature-wide rollup across all of this Feature's UI/UX Epics, regardless of Release or Component."
              >
                <span class="block text-[9px] font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Feature-wide Epic rollup</span>
                <div class="flex items-center gap-3">
                  <UiUxStatusBadge label="UX" :status="card.ux.status" :conflict="card.ux.conflict" data-testid="ux-badge" />
                  <UiUxStatusBadge label="UI" :status="card.ui.status" :conflict="card.ui.conflict" data-testid="ui-badge" />
                </div>
              </div>
            </div>

            <div v-if="card.labels.length > 0 || card.alsoIn.length > 0 || card.otherReason || card.matchedVia" class="flex flex-wrap items-center gap-1">
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

            <button
              type="button"
              data-testid="epics-toggle"
              class="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
              :aria-expanded="expandedKeys.has(card.key)"
              :aria-controls="epicsId(card)"
              @click="emit('toggle-epics', card.key)"
            >
              <svg
                class="w-3 h-3 text-gray-400 transition-transform"
                :class="{ '-rotate-90': !expandedKeys.has(card.key) }"
                fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
              ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              {{ card.sources.length }} Epic{{ card.sources.length === 1 ? '' : 's' }}
              <span v-if="matchCount(card) > 0" data-testid="epics-match-count" class="text-primary-600 dark:text-primary-400">&middot; {{ matchCount(card) }} {{ matchCount(card) === 1 ? 'match' : 'matches' }}</span>
            </button>

            <div v-show="expandedKeys.has(card.key)" :id="epicsId(card)" class="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 dark:bg-gray-900/40 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Epic</th>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Type</th>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Status</th>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Assignee</th>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Priority</th>
                    <th scope="col" class="px-2 py-1 text-left font-semibold">Release</th>
                    <th v-for="workstream in WORKSTREAMS" :key="workstream.id" scope="col" class="px-2 py-1 text-left font-semibold">{{ workstream.label }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
                  <tr
                    v-for="source in card.sources"
                    :key="source.epicKey"
                    data-testid="source-row"
                    :class="{ 'bg-primary-50 dark:bg-primary-900/20': source.matched, 'opacity-70': source.noWork }"
                    :data-matched="source.matched ? 'true' : undefined"
                  >
                    <td class="px-2 py-1 whitespace-nowrap"><a :href="JIRA_BASE + source.epicKey" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono font-semibold">{{ source.epicKey }}</a></td>
                    <td class="px-2 py-1 whitespace-nowrap text-gray-500 dark:text-gray-400">{{ EPIC_TYPE_LABELS[source.epicType] || source.epicType }}</td>
                    <td class="px-2 py-1 whitespace-nowrap">
                      <span class="inline-flex items-center gap-1">
                        <StatusBadge v-if="source.status" :status="source.status" />
                        <span v-else class="text-gray-400 dark:text-gray-500">—</span>
                        <span
                          v-if="source.noWork"
                          data-testid="no-work-chip"
                          class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                          :title="NO_WORK_HELP"
                        >{{ source.resolution }}</span>
                      </span>
                    </td>
                    <td class="px-2 py-1 whitespace-nowrap" :class="source.status !== undefined && !source.assignee ? 'italic text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-400'">{{ source.status !== undefined ? (assigneeDisplayLabel(source.assignee) || 'Unassigned') : '—' }}</td>
                    <td class="px-2 py-1 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ source.priority || '—' }}</td>
                    <td class="px-2 py-1 whitespace-nowrap text-gray-600 dark:text-gray-400">{{ source.fixVersions.length > 0 ? source.fixVersions.join(', ') : '—' }}</td>
                    <td v-for="workstream in WORKSTREAMS" :key="workstream.id" class="px-2 py-1 whitespace-nowrap" :data-testid="`source-${workstream.id}`">
                      <span
                        v-if="source[workstream.id] !== null"
                        class="inline-flex items-center gap-1.5"
                        :class="isNeutral(source[workstream.id]) ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'"
                      >
                        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="dotClass(source[workstream.id])" aria-hidden="true" />
                        {{ UI_UX_STATUS_LABELS[source[workstream.id]] || source[workstream.id] }}
                      </span>
                      <span v-else class="text-gray-400 dark:text-gray-500">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
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
