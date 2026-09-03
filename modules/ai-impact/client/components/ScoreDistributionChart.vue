<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client/composables/useDarkMode.js'
import InfoBubble from './InfoBubble.vue'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({
  assessments: { type: Object, default: () => ({}) }
})

const { textColor, gridColor } = useDarkMode()

// Bucketing/pass-fail threshold intentionally unchanged — this is a
// presentation-only pass, not a metric-correctness change.
const buckets = computed(() => {
  const counts = Array(11).fill(0)
  for (const a of Object.values(props.assessments)) {
    const score = Math.max(0, Math.min(10, a.total))
    counts[score]++
  }
  return counts
})

const chartData = computed(() => ({
  labels: Array.from({ length: 11 }, (_, i) => String(i)),
  datasets: [{
    label: 'PRDs',
    data: buckets.value,
    backgroundColor: buckets.value.map((_, i) => i < 5 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)'),
    borderColor: buckets.value.map((_, i) => i < 5 ? '#ef4444' : '#22c55e'),
    borderWidth: 1,
    borderRadius: 3
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => `Score: ${items[0].label}`,
        label: (item) => `${item.raw} PRD${item.raw !== 1 ? 's' : ''}`
      }
    }
  },
  scales: {
    x: {
      title: { display: true, text: 'Quality Score', color: textColor.value, font: { size: 11 } },
      ticks: { font: { size: 11 }, color: textColor.value },
      grid: { color: gridColor.value }
    },
    y: {
      title: { display: true, text: 'Count', color: textColor.value, font: { size: 11 } },
      ticks: { font: { size: 11 }, precision: 0, color: textColor.value },
      grid: { color: gridColor.value },
      beginAtZero: true
    }
  }
}))
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-medium dark:text-gray-300 flex items-center">
        Score Distribution
        <InfoBubble trigger="hover" text="Distribution of quality scores across filtered PRDs. Red bars indicate failing scores (0-4), green bars indicate passing scores (5-10)." />
      </h3>
    </div>
    <div class="h-64">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
