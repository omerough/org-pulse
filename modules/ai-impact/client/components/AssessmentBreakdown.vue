<script setup>
import { ref, computed } from 'vue'
import { rubricForAssessment } from '../rubric.js'
import FeedbackText from './FeedbackText.vue'

const props = defineProps({
  assessment: { type: Object, required: true },
  detail: { type: Object, default: null }
})

const selectedCriterion = ref(null)

function selectCriterion(key) {
  selectedCriterion.value = selectedCriterion.value === key ? null : key
}

// Render each assessment under its own rubric version (v1 legacy / v2 current).
const criteria = computed(() => {
  const rubric = rubricForAssessment(props.assessment)
  return rubric.keys.map(key => ({ key, label: rubric.labels[key] }))
})

const selectedLabel = computed(() => criteria.value.find(c => c.key === selectedCriterion.value)?.label ?? '')
const selectedNote = computed(() => props.detail?.latest?.criterionNotes?.[selectedCriterion.value] ?? null)

function getScoreClass(score) {
  if (score === 2) return 'bg-green-500'
  if (score === 1) return 'bg-amber-500'
  return 'bg-red-500'
}

function getPassFailClass(passFail) {
  return passFail === 'PASS'
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-700'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-700'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Total Score / Result -->
    <div class="flex items-start gap-6">
      <div>
        <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Score</p>
        <p class="font-bold" :class="assessment.passFail === 'PASS' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{ assessment.total }}/10
        </p>
      </div>
      <div>
        <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Result</p>
        <span
          class="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium uppercase"
          :class="getPassFailClass(assessment.passFail)"
        >
          {{ assessment.passFail }}
        </span>
      </div>
    </div>

    <!-- Criterion Cards -->
    <div class="grid grid-cols-2 gap-2">
      <div
        v-for="{ key, label } in criteria"
        :key="key"
        class="rounded-lg border border-gray-200 dark:border-gray-600 p-3 transition-colors"
        :class="[
          detail?.latest?.criterionNotes?.[key] ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : '',
          selectedCriterion === key ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-500' : ''
        ]"
        :role="detail?.latest?.criterionNotes?.[key] ? 'button' : undefined"
        :tabindex="detail?.latest?.criterionNotes?.[key] ? 0 : undefined"
        @click="detail?.latest?.criterionNotes?.[key] ? selectCriterion(key) : null"
        @keydown.enter="detail?.latest?.criterionNotes?.[key] ? selectCriterion(key) : null"
        @keydown.space.prevent="detail?.latest?.criterionNotes?.[key] ? selectCriterion(key) : null"
      >
        <div class="flex items-center justify-between">
          <span class="font-medium text-sm dark:text-gray-200">{{ label }}</span>
          <svg
            v-if="detail?.latest?.criterionNotes?.[key]"
            class="h-4 w-4 text-gray-400 transition-transform shrink-0"
            :class="{ 'rotate-180': selectedCriterion === key }"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        <div class="flex items-center gap-2 mt-1.5">
          <!-- Score dots -->
          <span class="flex gap-1">
            <span
              v-for="i in 2"
              :key="i"
              class="w-3 h-3 rounded-full"
              :class="i <= assessment.scores[key] ? getScoreClass(assessment.scores[key]) : 'bg-gray-200 dark:bg-gray-600'"
            />
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ assessment.scores[key] }}/2</span>
        </div>
      </div>
    </div>

    <!-- Selected criterion detail panel -->
    <div
      v-if="selectedNote"
      class="rounded-lg border border-gray-200 dark:border-gray-600 p-3"
    >
      <p class="font-medium text-sm dark:text-gray-200 mb-1.5">{{ selectedLabel }}</p>
      <FeedbackText :text="selectedNote" />
    </div>

    <!-- Anti-patterns -->
    <div v-if="assessment.antiPatterns && assessment.antiPatterns.length > 0" class="pt-1">
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Anti-patterns detected</p>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="pattern in assessment.antiPatterns"
          :key="pattern"
          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {{ pattern }}
        </span>
      </div>
    </div>
  </div>
</template>
