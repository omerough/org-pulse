<script setup>
import { computed, onMounted } from 'vue'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { useRoster } from '@shared/client/composables/useRoster.js'
import { useModuleLink } from '@shared/client/composables/useModuleLink.js'
import { useProjectId, projectParam } from '@shared/client/composables/useProjectId.js'

defineProps({
  size: { type: String, default: 'half' }
})

const { navigateTo: crossNavigate } = useModuleLink()
const projectId = useProjectId()
const { user } = useAuth()
const { teams: rosterTeams, loading, loadRoster } = useRoster()

onMounted(loadRoster)

const allTeams = computed(() => rosterTeams.value.map(team => ({
  key: team.key,
  displayName: team.displayName,
  members: team.members
})))

function isCurrentUser(member) {
  const email = user.value?.email?.toLowerCase()
  return email && member.email?.toLowerCase() === email
}

const myTeams = computed(() => {
  if (!user.value?.email) return []
  return allTeams.value.filter(t => t.members.some(isCurrentUser))
})

function handleTeamClick(teamKey) {
  crossNavigate('team-tracker', 'team-detail', { ...projectParam(projectId.value), teamKey, from: 'sotu' })
}
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">My Teams</h3>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 2" :key="i" class="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 animate-pulse h-20" />
    </div>

    <template v-else>
      <div v-if="myTeams.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
        <svg class="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p class="text-sm text-gray-500 dark:text-gray-400">You are not assigned to any teams.</p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="team in myTeams"
          :key="team.key"
          @click="handleTeamClick(team.key)"
          class="w-full bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-left cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{{ team.displayName }}</h4>
        </button>
      </div>
    </template>
  </div>
</template>
