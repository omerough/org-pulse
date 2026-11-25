<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { UI_UX_STATUS_LABELS } from '../utils/featureComponentBoard'

const props = defineProps({
  label: { type: String, required: true },
  allLabel: { type: String, required: true },
  options: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] }
})

const emit = defineEmits(['toggle'])

const open = ref(false)
const root = ref(null)

const statusText = status => UI_UX_STATUS_LABELS[status] || status
const buttonText = computed(() => {
  if (props.selected.length === 0) return props.allLabel
  return props.selected.length === 1 ? statusText(props.selected[0]) : `${props.selected.length} selected`
})

function onClickOutside(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

const btnClass = 'flex items-center gap-1.5 cursor-pointer text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400'
const btnActiveClass = 'flex items-center gap-1.5 cursor-pointer text-xs rounded-md border border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400'
</script>

<template>
  <div v-if="options.length > 0" class="flex flex-col gap-0.5">
    <label class="text-xs font-medium text-gray-600 dark:text-gray-400">{{ label }}</label>
    <div ref="root" class="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :class="selected.length ? btnActiveClass : btnClass"
        @click="open = !open"
        @keydown.escape="open = false"
      >
        <span class="truncate max-w-[140px]">{{ buttonText }}</span>
        <svg class="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </button>
      <div
        v-if="open"
        role="group"
        :aria-label="label"
        class="absolute z-50 mt-1 w-48 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
        @keydown.escape="open = false"
      >
        <label
          v-for="status in options"
          :key="status"
          class="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
        >
          <input
            type="checkbox"
            :checked="selected.includes(status)"
            class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            @change="emit('toggle', status)"
          />
          <span class="truncate">{{ statusText(status) }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
