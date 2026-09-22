<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    :class="colorClass || FALLBACK_CLASS"
  >
    {{ workgroup || 'Unspecified' }}
  </span>
</template>

<script setup>
const FALLBACK_CLASS = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'

defineProps({
  workgroup: { type: String, default: null },
  colorClass: { type: String, default: null }
})
</script>
