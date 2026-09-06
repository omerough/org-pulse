<script setup>
import { computed } from 'vue'

const props = defineProps({
  features: { type: Object, default: () => ({}) },
  allTimeTotal: { type: Number, default: null }
})

const featureList = computed(() => Object.values(props.features))

const totalFeatures = computed(() => featureList.value.length)

// Avg Score / Approval Rate aggregate AI scores, so their population is
// features with an actual score. humanReviewStatus (below) is set from Jira
// sign-off labels independently of scoring, so it needs its own population.
const scoredFeatures = computed(() => featureList.value.filter(f => f.scores?.total != null))

// null (not 0) when there is no scored population, so the template can
// render "—" instead of a misleading 0%/0 that looks like a real result.
const approvalRate = computed(() => {
  if (scoredFeatures.value.length === 0) return null
  const approved = scoredFeatures.value.filter(f => f.recommendation === 'approve').length
  return Math.round((approved / scoredFeatures.value.length) * 100)
})

const avgScore = computed(() => {
  if (scoredFeatures.value.length === 0) return null
  const sum = scoredFeatures.value.reduce((acc, f) => acc + (f.scores?.total || 0), 0)
  return (sum / scoredFeatures.value.length).toFixed(1)
})

// Needs Action / Signed Off track human sign-off, which only applies once a
// Design artifact exists (designPrStatus != null) -- with no artifact there's
// nothing to sign off, and humanReviewStatus's 'awaiting-review' default would
// otherwise inflate "Needs Action" for every unstarted feature.
const featuresWithDesign = computed(() => featureList.value.filter(f => f.designPrStatus != null))

const needsActionCount = computed(() => {
  return featuresWithDesign.value.filter(f => f.humanReviewStatus === 'needs-review' || f.humanReviewStatus === 'awaiting-review').length
})

const signedOffCount = computed(() => {
  return featuresWithDesign.value.filter(f => f.humanReviewStatus === 'approved').length
})
</script>

<template>
  <div class="p-6 border-b border-gray-200 dark:border-gray-700">
    <div class="grid gap-6 grid-cols-2 lg:grid-cols-5">
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">Total Features</p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ totalFeatures }}</span>
        <p v-if="allTimeTotal !== null" class="text-xs text-gray-400 dark:text-gray-500">{{ allTimeTotal }} all time</p>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">Approval Rate</p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ approvalRate === null ? '—' : `${approvalRate}%` }}</span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">Avg Score</p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ avgScore === null ? '—' : avgScore }}</span>
        <p class="text-xs text-gray-400 dark:text-gray-500">out of 8</p>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">Needs Action</p>
        <span class="text-3xl font-bold" :class="needsActionCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'dark:text-gray-100'">
          {{ needsActionCount }}
        </span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400">Signed Off</p>
        <span class="text-3xl font-bold" :class="signedOffCount > 0 ? 'text-green-600 dark:text-green-400' : 'dark:text-gray-100'">
          {{ signedOffCount }}
        </span>
      </div>
    </div>
  </div>
</template>
