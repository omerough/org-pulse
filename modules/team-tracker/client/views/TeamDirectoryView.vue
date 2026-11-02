<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useProjectDisplayName } from '../composables/useProjectDisplayName'
import TeamCard from '../components/TeamCard.vue'

const nav = inject('moduleNav')
const projectId = useProjectId()
const projectLabel = useProjectDisplayName()
const {
  rosterData,
  teams,
  loading,
  error: projectRosterError,
  uniqueMemberCount,
  loadRoster
} = useRoster()
const searchQuery = ref('')
const sortBy = ref('name')

const projectRosterStatus = computed(() => {
  const availability = rosterData.value?.availability
  if (availability === 'available') return 'Supported'
  if (availability === 'empty') return 'Empty'
  if (availability === 'unavailable') return 'Unavailable'
  return ''
})
const projectRosterUpdatedAt = computed(() => rosterData.value?.generatedAt || null)
const projectTeams = computed(() => teams.value.map(team => ({
  key: team.key,
  name: team.displayName,
  org: projectLabel.value,
  memberCount: team.members.length,
  members: team.members,
  metadata: team.metadata || {}
})))

const visibleTeams = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const result = projectTeams.value.filter(team => {
    if (!query) return true
    return team.name.toLowerCase().includes(query)
      || team.members.some(member => (member.jiraDisplayName || member.name || '').toLowerCase().includes(query))
  })

  if (sortBy.value === 'headcount') {
    return [...result].sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name))
  }
  return [...result].sort((a, b) => a.name.localeCompare(b.name))
})

const projectRosterUnavailable = computed(() =>
  !loading.value
  && (Boolean(projectRosterError.value) || rosterData.value?.availability === 'unavailable')
)

function openTeam(team) {
  nav.navigateTo('team-detail', { teamKey: team.key })
}

onMounted(loadRoster)
watch(projectId, () => {
  sortBy.value = 'name'
  loadRoster()
})
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Team Directory</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ visibleTeams.length }} teams · {{ uniqueMemberCount }} people</p>
        <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {{ projectRosterStatus || (projectRosterError ? 'Unavailable' : 'Loading') }}
          <span v-if="projectRosterUpdatedAt"> · Updated {{ new Date(projectRosterUpdatedAt).toLocaleString() }}</span>
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search teams..."
            class="w-64 pl-4 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select v-model="sortBy" class="h-[38px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="name">A–Z</option>
          <option value="headcount">Headcount</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="projectRosterUnavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center" role="status">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Team roster unavailable</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ projectRosterError || rosterData?.reason || 'No current roster publication is available for this project.' }}</p>
    </div>

    <div v-else-if="visibleTeams.length === 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Teams Found</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">The published roster has no teams or no team matches this search.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="team in visibleTeams" :key="team.key">
        <TeamCard
          :team="team"
          @select="openTeam(team)"
        />
      </div>
    </div>
  </div>
</template>
