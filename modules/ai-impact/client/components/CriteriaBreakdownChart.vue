<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  LineController,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client/composables/useDarkMode.js'
import InfoBubble from './InfoBubble.vue'
import { RUBRICS, rubricForAssessment } from '../rubric.js'
import { SCORE_HEX, scoreRgba, bandForCriterionAvg } from '../utils/score-colors.js'

// LineElement/PointElement/LineController register the "point-only" Zero-Score %
// dataset below (a mixed bar+line chart) — it renders as markers, never a line.
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, LineController, Title, Tooltip, Legend)

const props = defineProps({
  assessments: { type: Object, default: () => ({}) }
})

// Aggregate over current-rubric (v2) reviews only — v2 is the growing
// majority; v1 (legacy) reviews still display individually under their own
// rubric but are excluded from this aggregate to keep dimensions comparable.
const CRITERIA = RUBRICS.v2.keys
const CRITERIA_LABELS = RUBRICS.v2.labels

const { textColor, gridColor, cardBackground } = useDarkMode()

const stats = computed(() => {
  const entries = Object.values(props.assessments)
    .filter(a => rubricForAssessment(a).version === 'v2')
  const count = entries.length
  if (count === 0) {
    return CRITERIA.map(c => ({ criterion: c, avg: 0, zeroPct: 0 }))
  }
  return CRITERIA.map(c => {
    let sum = 0
    let zeros = 0
    for (const a of entries) {
      const score = a.scores?.[c] ?? 0
      sum += score
      if (score === 0) zeros++
    }
    return {
      criterion: c,
      avg: Math.round((sum / count) * 100) / 100,
      zeroPct: Math.round((zeros / count) * 100)
    }
  })
})

// Wrap long criterion labels onto two lines so they stay legible at the
// chart's tick font size instead of colliding or overlapping.
function wrapLabel(label) {
  if (label.length <= 10) return label
  const words = label.split(' ')
  if (words.length === 1) return label
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

const chartData = computed(() => ({
  labels: CRITERIA.map(c => wrapLabel(CRITERIA_LABELS[c])),
  datasets: [
    {
      label: 'Avg Score (0-2)',
      data: stats.value.map(s => s.avg),
      backgroundColor: stats.value.map(s => scoreRgba(bandForCriterionAvg(s.avg), 0.85)),
      borderColor: stats.value.map(s => SCORE_HEX[bandForCriterionAvg(s.avg)]),
      borderWidth: 1,
      borderRadius: 3,
      yAxisID: 'y'
    },
    {
      // Rendered as a point marker (not a bar) on its own axis: a second
      // grouped bar dataset would make Chart.js reserve a same-width slot
      // for it even though it's visually thin, which is what pushed the Avg
      // Score bar off-center within its category. A point sidesteps that
      // entirely — it draws at the category's exact center regardless of
      // bar-grouping width math. `showLine: false` keeps criteria as
      // discrete categories rather than implying a trend between them.
      type: 'line',
      label: 'Zero-Score %',
      data: stats.value.map(s => s.zeroPct),
      showLine: false,
      pointStyle: 'circle',
      pointRadius: 5,
      pointHoverRadius: 6,
      // Hollow: fill matches the card background (not a translucent red) so the
      // marker reads as a ring rather than a dot. At 0% the point sits exactly
      // on the baseline gridline — a light fill would visually merge into it
      // and look like a missing dataset rather than an explicit "0%".
      backgroundColor: cardBackground.value,
      borderColor: SCORE_HEX.red,
      borderWidth: 2.5,
      yAxisID: 'y1'
    }
  ]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  barPercentage: 0.6,
  categoryPercentage: 0.6,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => CRITERIA_LABELS[CRITERIA[items[0].dataIndex]],
        label: (item) => {
          if (item.datasetIndex === 0) return `Avg: ${item.raw}/2`
          return `Zero-score: ${item.raw}%`
        }
      }
    }
  },
  scales: {
    y: {
      position: 'left',
      min: 0,
      max: 2,
      title: { display: true, text: 'Avg Score', color: textColor.value, font: { size: 11 } },
      ticks: { font: { size: 11 }, stepSize: 0.5, color: textColor.value },
      grid: { color: gridColor.value }
    },
    y1: {
      position: 'right',
      min: 0,
      max: 100,
      title: { display: true, text: 'Zero-Score %', color: textColor.value, font: { size: 11 } },
      ticks: { font: { size: 11 }, color: textColor.value },
      grid: { drawOnChartArea: false }
    },
    x: {
      title: { display: true, text: 'Criterion', color: textColor.value, font: { size: 11 } },
      ticks: { font: { size: 11 }, color: textColor.value },
      grid: { color: gridColor.value }
    }
  }
}))
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <!-- Legend sits on the same header row (not a row of its own) so this
         card's plot area starts at the same height as Score Distribution's —
         a spacer row here would misalign the two side-by-side charts instead. -->
    <div class="flex items-center justify-between flex-wrap gap-y-1 mb-3">
      <h3 class="text-sm font-medium dark:text-gray-300 flex items-center">
        Criteria Performance
        <InfoBubble trigger="hover" text="Average score per criterion (0-2 scale) and percentage of PRDs scoring zero per criterion. Identifies which quality dimensions are weakest." />
      </h3>

      <!-- Compact color key: Chart.js's auto-legend can't represent a
           per-bar-colored dataset, so the Avg Score bands and the Zero-Score %
           treatment are spelled out explicitly here. -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background-color: #22c55e" /> &ge;1.75</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background-color: #f59e0b" /> 1.0–1.74</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background-color: #ef4444" /> &lt;1.0</span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full border-2 bg-white dark:bg-gray-800" style="border-color: #ef4444" />
          Zero-Score %
        </span>
      </div>
    </div>

    <div class="h-64">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
