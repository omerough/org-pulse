<script setup>
defineProps({
  label: { type: String, required: true },
  values: { type: Array, default: () => [] }
})
</script>

<template>
  <div v-if="values?.length">
    <p class="text-gray-500 dark:text-gray-400 text-xs mb-1.5">{{ label }}</p>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="value in values"
        :key="value"
        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
      >
        {{ value }}
      </span>
    </div>
  </div>
</template>
