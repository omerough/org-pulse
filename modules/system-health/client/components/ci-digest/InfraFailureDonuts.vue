<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLOR_INFRA = '#ef4444'
const COLOR_TEST = '#10b981'

const props = defineProps({
  // { infra_total, test_total, total_failures, infra_by_step }
  window24: { type: Object, required: true },
  window72: { type: Object, required: true }
})

const { gridColor } = useDarkMode()

function donutData(window) {
  const infra = window.infra_total || 0
  const test = window.test_total || 0
  if (infra + test === 0) {
    return { labels: ['No failures'], datasets: [{ data: [1], backgroundColor: [gridColor.value], borderWidth: 0 }] }
  }
  return {
    labels: ['Infra', 'Test'],
    datasets: [{ data: [infra, test], backgroundColor: [COLOR_INFRA, COLOR_TEST], borderWidth: 2, borderColor: 'transparent' }]
  }
}

const data24 = computed(() => donutData(props.window24))
const data72 = computed(() => donutData(props.window72))

function donutOptions(window) {
  const total = (window.infra_total || 0) + (window.test_total || 0)
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: total > 0,
        callbacks: {
          label(ctx) {
            const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0
            return `${ctx.label}: ${ctx.parsed} (${pct}%)`
          }
        }
      }
    }
  }
}

const options24 = computed(() => donutOptions(props.window24))
const options72 = computed(() => donutOptions(props.window72))

const topSteps = computed(() => (props.window72.infra_by_step || []).slice(0, 5))
</script>

<template>
  <div>
    <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
      Red = infra-caused failures (CI's own fault), green = product/test failures. Ring size shows the failure count for that window.
    </p>
    <div class="grid grid-cols-2 gap-4">
      <div class="text-center">
        <div class="h-32 relative">
          <Doughnut :data="data24" :options="options24" />
        </div>
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">24h</div>
        <div class="text-[11px] text-gray-400 dark:text-gray-500">{{ window24.total_failures || 0 }} failures</div>
      </div>
      <div class="text-center">
        <div class="h-32 relative">
          <Doughnut :data="data72" :options="options72" />
        </div>
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">72h</div>
        <div class="text-[11px] text-gray-400 dark:text-gray-500">{{ window72.total_failures || 0 }} failures</div>
      </div>
    </div>
    <div class="flex justify-center gap-4 mt-3 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#ef4444"></span>Infra</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#10b981"></span>Test</span>
    </div>
    <p v-if="topSteps.length" class="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
      Top infra steps (72h): {{ topSteps.map(s => `${s.step} (${s.count})`).join(', ') }}
    </p>
  </div>
</template>
