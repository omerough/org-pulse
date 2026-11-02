<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ projectLabel }} Dashboard</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Project summary</p>
    </div>

    <div v-if="projectLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="projectUnavailable" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
      <p class="text-red-700 dark:text-red-400 text-sm">No current roster publication is available for this project.</p>
    </div>

    <template v-else-if="projectRoster">
      <div v-if="projectEmpty" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Active People Published</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">The published project roster has no active people yet.</p>
      </div>

      <template v-else>
        <!-- Stats cards -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          <button
            @click="goToTeamDirectory"
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
          >
            <p class="text-3xl font-bold text-primary-600">{{ projectTeamCount }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">Teams</p>
          </button>
          <button
            @click="goToPeople"
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
          >
            <p class="text-3xl font-bold text-primary-600">{{ projectRoleHeadcount.totalHeadcount }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">People</p>
          </button>
        </div>

        <!-- Role Breakdown -->
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Headcount by Role</h3>
          <HeadcountChart :headcount="projectRoleHeadcount" />
        </div>

        <!-- Teams -->
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
          <button class="flex items-center gap-2 group mb-4" @click="teamsExpanded = !teamsExpanded">
            <svg
              class="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform"
              :class="{ '-rotate-90': !teamsExpanded }"
              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Teams ({{ projectTeamCount }})</h3>
          </button>
          <div v-if="teamsExpanded" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                    @click="toggleSort('name')"
                  >
                    Team <span v-if="teamSort === 'name'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                  </th>
                  <th
                    class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                    @click="toggleSort('members')"
                  >
                    Members <span v-if="teamSort === 'members'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="t in sortedProjectTeams"
                  :key="t.key"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  @click="goToTeam(t)"
                >
                  <td class="px-4 py-3">
                    <span class="text-primary-600 hover:text-primary-800 dark:hover:text-primary-400 hover:underline font-medium">{{ t.displayName }}</span>
                  </td>
                  <td class="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{{ t.members.length }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import HeadcountChart from '../components/HeadcountChart.vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useProjectDisplayName } from '../composables/useProjectDisplayName'
import { deriveHeadcountByRole } from '../utils/member-resolution'

const nav = inject('moduleNav')
const projectId = useProjectId()
const projectLabel = useProjectDisplayName()
const {
  rosterData,
  people: canonicalPeople,
  teams: canonicalTeams,
  loading: canonicalLoading,
  error: canonicalError,
  loadRoster
} = useRoster()

const teamSort = ref('members')
const teamSortDir = ref('desc')
const teamsExpanded = ref(true)

// Gated on a projectId match so a stale fetch from a just-left project never renders.
const projectRoster = computed(() => {
  if (rosterData.value?.projectId !== projectId.value) return null
  return rosterData.value
})

const projectLoading = computed(() => canonicalLoading.value)

const projectUnavailable = computed(() =>
  !projectLoading.value &&
  (Boolean(canonicalError.value) || projectRoster.value?.availability === 'unavailable')
)

// Each roster person appears once per project, so this is already the unique
// active headcount — including active people with no team (teamIds: []).
const activeProjectPeople = computed(() => {
  if (!projectRoster.value) return []
  return (canonicalPeople.value || []).filter(p => p.active)
})

const projectEmpty = computed(() => Boolean(projectRoster.value) && activeProjectPeople.value.length === 0)

// Shares one derivation with the headcount stat tile so role breakdown and
// total headcount can never disagree.
const projectRoleHeadcount = computed(() => deriveHeadcountByRole(activeProjectPeople.value))

const projectTeamCount = computed(() => (projectRoster.value ? canonicalTeams.value.length : 0))

const sortedProjectTeams = computed(() => {
  if (!projectRoster.value) return []
  const dir = teamSortDir.value === 'asc' ? 1 : -1
  return [...canonicalTeams.value].sort((a, b) =>
    teamSort.value === 'name' ? dir * a.displayName.localeCompare(b.displayName) : dir * (a.members.length - b.members.length)
  )
})

function toggleSort(column) {
  if (teamSort.value === column) {
    teamSortDir.value = teamSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    teamSort.value = column
    teamSortDir.value = column === 'name' ? 'asc' : 'desc'
  }
}

function goToTeamDirectory() {
  nav.navigateTo('home')
}

function goToPeople() {
  nav.navigateTo('people')
}

function goToTeam(team) {
  nav.navigateTo('team-detail', { teamKey: team.key })
}

onMounted(loadRoster)

watch(projectId, () => {
  teamSort.value = 'members'
  teamSortDir.value = 'desc'
  loadRoster()
})
</script>
