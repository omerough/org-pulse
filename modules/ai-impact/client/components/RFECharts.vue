<script setup>
import { computed, ref } from 'vue'
import ScoreDistributionChart from './ScoreDistributionChart.vue'
import CriteriaBreakdownChart from './CriteriaBreakdownChart.vue'

const props = defineProps({
  assessments: { type: Object, default: () => ({}) }
})

const hasAssessments = computed(() => Object.keys(props.assessments).length > 0)

const expanded = ref(true)
</script>

<template>
  <div v-if="hasAssessments" class="border-b border-gray-200 dark:border-gray-700">
    <button
      @click="expanded = !expanded"
      class="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <span class="flex items-center gap-2 text-sm font-medium dark:text-gray-300">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Score Insights
      </span>
      <svg
        class="h-4 w-4 transition-transform dark:text-gray-300"
        :class="{ 'rotate-180': expanded }"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="expanded" class="px-6 pb-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScoreDistributionChart :assessments="assessments" />
        <CriteriaBreakdownChart :assessments="assessments" />
      </div>
    </div>
  </div>
</template>
