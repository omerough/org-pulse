<script setup>
const AI_COMMITS_ORIGINAL_URL = 'https://ai-commits-scanner-fd01cc.pages.redhat.com/osac/index.html'
const AI_COMMITS_PROXY_URL = '/api/modules/ai-impact/ai-commits-proxy'
</script>

<template>
  <div class="flex flex-col -mx-6 -my-6 lg:-mx-8" style="min-height: calc(100vh - 4rem)">
    <div class="px-6 lg:px-8 pt-3 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Commits</h1>
        <a
          :href="AI_COMMITS_ORIGINAL_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >Open in new tab</a>
      </div>
    </div>

    <iframe
      :src="AI_COMMITS_PROXY_URL"
      title="AI Commits Scanner — OSAC"
      sandbox="allow-scripts allow-same-origin"
      class="w-full flex-1 border-0 block min-h-0"
      style="height: calc(100vh - 9rem)"
    />
  </div>
</template>
