<script setup>
import { ref, computed, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import { componentDisplayLabel } from '../composables/useComponentStatusFilter'

const props = defineProps({
  component: { type: String, required: true },
  rows: { type: Array, required: true },
  memberCount: { type: Number, default: null },
  pageSize: { type: Number, default: 10 }
})

const JIRA_BASE = 'https://redhat.atlassian.net/browse/'
const MAX_LABEL_CHIPS = 5

const isEmpty = computed(() => props.rows.length === 0)
const collapsed = ref(isEmpty.value)
const showAll = ref(false)

watch(isEmpty, empty => { collapsed.value = empty })
watch(() => props.rows, () => { showAll.value = false })

const visibleRows = computed(() => showAll.value ? props.rows : props.rows.slice(0, props.pageSize))
const hiddenCount = computed(() => props.rows.length - visibleRows.value.length)
const isNarrowed = computed(() => props.memberCount !== null && props.memberCount !== props.rows.length)
const contentId = computed(() => 'epic-panel-' + props.component.replace(/[^a-z0-9]+/gi, '-').toLowerCase())

function alsoInText(alsoIn) {
  return 'also in: ' + alsoIn.map(componentDisplayLabel).join(', ')
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
        @click="collapsed = !collapsed"
      >
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{{ componentDisplayLabel(component) }}</span>
          <span
            data-testid="panel-count"
            class="inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          >{{ isNarrowed ? `${rows.length} of ${memberCount}` : rows.length }}</span>
        </span>
        <svg
          class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform"
          :class="{ '-rotate-90': collapsed }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
    </h3>

    <div v-show="!collapsed" :id="contentId" class="border-t border-gray-100 dark:border-gray-700/60">
      <p v-if="isEmpty" class="px-4 py-4 text-sm italic text-gray-500 dark:text-gray-400">No matching Epics</p>

      <template v-else>
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full min-w-[40rem] text-sm">
            <thead>
              <tr class="text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                <th scope="col" class="px-4 py-2 whitespace-nowrap">Key</th>
                <th scope="col" class="px-2 py-2 min-w-[16rem]">Summary</th>
                <th scope="col" class="px-2 py-2">Priority</th>
                <th scope="col" class="px-2 py-2">Status</th>
                <th scope="col" class="px-2 py-2">Assignee</th>
                <th scope="col" class="px-2 py-2">Labels</th>
                <th scope="col" class="px-4 py-2 whitespace-nowrap">Fix versions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60">
              <tr v-for="{ epic, alsoIn } in visibleRows" :key="epic.key" data-testid="epic-row" class="align-top">
                <td class="px-4 py-2 whitespace-nowrap">
                  <a :href="JIRA_BASE + epic.key" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold">{{ epic.key }}</a>
                  <span v-if="alsoIn.length > 0" data-testid="also-in" class="block mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{{ alsoInText(alsoIn) }}</span>
                </td>
                <td class="px-2 py-2 text-gray-900 dark:text-gray-100">{{ epic.summary }}</td>
                <td class="px-2 py-2 whitespace-nowrap text-xs" :class="epic.priority && epic.priority !== 'Undefined' ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'">{{ epic.priority || 'Undefined' }}</td>
                <td class="px-2 py-2 whitespace-nowrap"><StatusBadge :status="epic.status" /></td>
                <td class="px-2 py-2 text-xs">
                  <span v-if="epic.assignee" class="text-gray-700 dark:text-gray-300">{{ epic.assignee }}</span>
                  <span v-else class="italic text-gray-500 dark:text-gray-400">Unassigned</span>
                </td>
                <td class="px-2 py-2">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="label in (epic.labels || []).slice(0, MAX_LABEL_CHIPS)" :key="label" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400">{{ label }}</span>
                    <span v-if="(epic.labels || []).length > MAX_LABEL_CHIPS" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">+{{ epic.labels.length - MAX_LABEL_CHIPS }}</span>
                  </div>
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">{{ (epic.fixVersions || []).join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul class="md:hidden divide-y divide-gray-100 dark:divide-gray-700/60">
          <li v-for="{ epic, alsoIn } in visibleRows" :key="epic.key" data-testid="epic-card" class="px-4 py-3 space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <a :href="JIRA_BASE + epic.key" target="_blank" rel="noopener" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold">{{ epic.key }}</a>
              <StatusBadge :status="epic.status" />
              <span v-if="alsoIn.length > 0" class="text-[10px] text-gray-500 dark:text-gray-400">{{ alsoInText(alsoIn) }}</span>
            </div>
            <p class="text-sm text-gray-900 dark:text-gray-100">{{ epic.summary }}</p>
            <div v-if="(epic.labels || []).length > 0" class="flex flex-wrap gap-1">
              <span v-for="label in epic.labels.slice(0, MAX_LABEL_CHIPS)" :key="label" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400">{{ label }}</span>
              <span v-if="epic.labels.length > MAX_LABEL_CHIPS" class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">+{{ epic.labels.length - MAX_LABEL_CHIPS }}</span>
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              <span :class="{ italic: !epic.assignee }">{{ epic.assignee || 'Unassigned' }}</span>
              &middot; {{ epic.priority || 'Undefined' }}
              <template v-if="(epic.fixVersions || []).length > 0">&middot; {{ epic.fixVersions.join(', ') }}</template>
            </p>
          </li>
        </ul>

        <div v-if="rows.length > pageSize" class="px-4 py-2 border-t border-gray-100 dark:border-gray-700/60">
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
