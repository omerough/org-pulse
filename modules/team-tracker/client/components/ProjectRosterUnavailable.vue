<script setup>
import { inject } from 'vue'

const nav = inject('moduleNav', null)
</script>

<template>
  <div class="text-center py-12 text-gray-500 dark:text-gray-400" data-testid="not-available-for-project">
    <p>Not available for project rosters.</p>
    <button class="mt-3 text-sm text-primary-600 dark:text-primary-400 hover:underline" @click="nav?.navigateTo('home')">
      Back to home
    </button>
  </div>
</template>
