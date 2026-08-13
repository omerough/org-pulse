<script setup>
const props = defineProps({
  features: { type: Array, default: () => [] },
  releaseNames: { type: Object, default: () => ({}) }
})

const JIRA_BASE = 'https://redhat.atlassian.net/browse'

const SCOPE_BADGES = {
  added: { label: 'Added', badge: 'bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300' },
  dropped: { label: 'Dropped', badge: 'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300' },
  moved: { label: 'Moved', badge: 'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300' },
  unknown: { label: 'Unknown', badge: 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400' }
}

function scopeBadge(feature) {
  if (!feature.scopeChange) return { label: 'Committed', badge: 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300' }
  return SCOPE_BADGES[feature.scopeChange] || SCOPE_BADGES.unknown
}

function movedToLabel(feature) {
  if (!feature.movedTo) return ''
  var name = props.releaseNames[feature.movedTo.releaseId] || feature.movedTo.releaseId
  return name + ' (' + feature.movedTo.fixVersion + ')'
}

function scopeTooltip(feature) {
  if (feature.scopeChange === 'added' && feature.fixVersionAddedAt) {
    return 'Fix Version added ' + formatDate(feature.fixVersionAddedAt)
  }
  if (feature.scopeChange === 'dropped' && feature.fixVersionRemovedAt) {
    return 'Fix Version removed ' + formatDate(feature.fixVersionRemovedAt)
  }
  if (feature.scopeChange === 'moved') {
    var base = 'Moved to ' + movedToLabel(feature)
    return feature.fixVersionRemovedAt ? base + ' on ' + formatDate(feature.fixVersionRemovedAt) : base
  }
  if (feature.scopeChange === 'unknown') {
    return 'No baseline could be established for this release — scope change cannot be classified'
  }
  return ''
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  var d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T00:00:00' : dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/80">
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Feature</th>
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title</th>
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Scope</th>
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">Status</th>
          <th class="px-3 py-2 text-center text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Priority</th>
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">Components</th>
          <th class="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Assignee</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="feature in features"
          :key="feature.key"
          class="border-b border-gray-100 dark:border-gray-800 transition-colors"
          :class="feature.scopeChange === 'dropped'
            ? 'bg-amber-50/30 dark:bg-amber-900/5 opacity-60 hover:opacity-80'
            : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'"
        >
          <td class="px-3 py-2.5 whitespace-nowrap">
            <a
              :href="`${JIRA_BASE}/${feature.key}`"
              target="_blank"
              rel="noopener"
              class="font-mono text-xs font-medium text-primary-600 dark:text-blue-400 hover:underline hover:text-primary-700 dark:hover:text-blue-300 transition-colors"
              :class="{ 'line-through': feature.scopeChange === 'dropped' }"
            >{{ feature.key }}</a>
          </td>

          <td class="px-3 py-2.5">
            <span
              class="text-sm text-gray-900 dark:text-gray-100"
              :class="{ 'line-through text-gray-400 dark:text-gray-500': feature.scopeChange === 'dropped' }"
            >{{ feature.summary }}</span>
          </td>

          <td class="px-3 py-2.5">
            <span
              class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              :class="scopeBadge(feature).badge"
              :title="scopeTooltip(feature)"
            >{{ scopeBadge(feature).label }}</span>
            <span v-if="feature.scopeChange === 'moved'" class="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[9rem]" :title="movedToLabel(feature)">
              → {{ movedToLabel(feature) }}
            </span>
          </td>

          <td class="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {{ feature.status || '--' }}
          </td>

          <td class="px-3 py-2.5 text-center">
            <span
              v-if="feature.isBlockerPriority"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
              title="Priority: Blocker"
            >
              <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              Blocker
            </span>
            <span v-else class="text-xs text-gray-400 dark:text-gray-500">{{ feature.priority || '--' }}</span>
          </td>

          <td class="px-3 py-2.5">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="comp in (feature.components || []).slice(0, 3)"
                :key="comp"
                class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
              >{{ comp }}</span>
              <span
                v-if="(feature.components || []).length > 3"
                class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800"
              >+{{ feature.components.length - 3 }}</span>
            </div>
          </td>

          <td class="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {{ feature.assignee || '--' }}
          </td>
        </tr>

        <tr v-if="features.length === 0">
          <td colspan="7" class="px-8 py-6 text-sm text-gray-400 dark:text-gray-500 italic text-center">
            No features match this filter.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
