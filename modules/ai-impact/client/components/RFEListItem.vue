<script setup>
import { getReviewStatusClass, getReviewStatusLabel, getPrdSignOffStatus } from '../utils/feature-helpers.js'

defineProps({
  rfe: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  assessment: { type: Object, default: null },
  hasLinkedFeature: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

function getInvolvementLabel(involvement) {
  switch (involvement) {
    case 'both': return 'Created & Revised'
    case 'created': return 'Created'
    case 'revised': return 'Revised'
    default: return 'N/A'
  }
}

// Categorical provenance colors, not success/failure semantics. 'both' is the dominant
// state in real PRD data, so it gets Design Review's AI green; 'created' uses teal.
function getInvolvementClass(involvement) {
  switch (involvement) {
    case 'both': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
    case 'created': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
    case 'revised': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    default: return 'bg-gray-100 text-gray-600'
  }
}
</script>

<template>
  <div
    @click="emit('select', rfe)"
    class="p-4 rounded-lg border cursor-pointer transition-all"
    :class="{
      'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-500': selected,
      'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700': !selected
    }"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ rfe.key }}</span>
        </div>
        <h4 class="font-medium text-sm truncate dark:text-gray-200">{{ rfe.summary }}</h4>
        <div class="flex items-center flex-wrap gap-2 mt-2">
          <span
            v-if="rfe.status === 'No PR'"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
          >
            Missing PRD
          </span>
          <template v-else>
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              :class="getInvolvementClass(rfe.aiInvolvement)"
            >
              <span class="font-medium opacity-75">AI</span>
              {{ getInvolvementLabel(rfe.aiInvolvement) }}
            </span>
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              :class="getReviewStatusClass(getPrdSignOffStatus(rfe.status))"
            >
              <span class="font-medium opacity-75">Review</span>
              {{ getReviewStatusLabel(getPrdSignOffStatus(rfe.status)) }}
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
              <span class="font-medium text-gray-500 dark:text-gray-400">Score</span>
              <span class="text-gray-800 dark:text-gray-100">{{ assessment ? `${assessment.total}/10` : 'N/A' }}</span>
            </span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
              <span class="font-medium text-gray-500 dark:text-gray-400">Priority</span>
              <span class="text-gray-800 dark:text-gray-100 capitalize">{{ rfe.priority }}</span>
            </span>
          </template>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span
          v-if="hasLinkedFeature"
          class="text-blue-500 dark:text-blue-400"
          title="View Feature"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </span>
        <svg class="h-4 w-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </div>
</template>
