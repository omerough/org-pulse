<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <div data-tour="dashboard-header" class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">My Teams</h2>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading dashboard...
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-center py-12 text-red-600 dark:text-red-400">
      {{ error }}
    </div>

    <!-- Empty state: no registry identity -->
    <div v-else-if="reason === 'no-registry-identity'" class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p class="text-lg font-medium mb-2">No Registry Identity</p>
      <p>Your account could not be matched to a person in this project's published roster, so no manager purview is available.</p>
    </div>

    <!-- Empty state: project roster publication unavailable -->
    <div v-else-if="availability && availability !== 'available' && availability !== 'empty'" class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p class="text-lg font-medium mb-2">Manager dashboard unavailable</p>
      <p>No current roster publication is available for this project{{ reason ? ` (${reason})` : '' }}.</p>
    </div>

    <!-- Empty state: no direct reports -->
    <div v-else-if="reason === 'no-direct-reports'" class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p class="text-lg font-medium mb-2">No Direct Reports</p>
      <p>You have no direct reports in the system.</p>
    </div>

    <!-- Empty state: hierarchy enrichment missing or untrusted -->
    <div v-else-if="reason === 'hierarchy-unavailable'" class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p class="text-lg font-medium mb-2">Manager Hierarchy Unavailable</p>
      <p>This project's manager/report data isn't currently published, so we can't tell whether you have direct reports.</p>
    </div>

    <!-- Dashboard content -->
    <template v-else>
      <p class="mb-4 text-xs text-gray-500 dark:text-gray-400" role="status">
        {{ projectStatusLabel }}
        <span v-if="generatedAtLabel"> · Updated {{ generatedAtLabel }}</span>
        <span v-if="enrichmentStatusNote"> · {{ enrichmentStatusNote }}</span>
      </p>

      <!-- Include indirect reports toggle -->
      <label data-tour="indirect-toggle" class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4 cursor-pointer select-none">
        <button
          role="switch"
          :aria-checked="includeIndirect"
          @click="toggleIndirectReports"
          class="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          :class="includeIndirect ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'"
        >
          <span
            class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            :class="includeIndirect ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
        Include indirect reports
      </label>

      <!-- Tabs -->
      <div class="flex space-x-4 border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :data-tour="tab.id === 'teams' ? 'tab-teams' : undefined"
          class="pb-2 px-1 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'border-primary-600 text-primary-600'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
        >
          {{ tab.label }}
          <span class="ml-1 text-xs text-gray-400 dark:text-gray-500">({{ tab.count }})</span>
        </button>
      </div>

      <!-- My Reports tab -->
      <div v-if="activeTab === 'reports'">
        <!-- Project roster: read-only reports (editing owned by Admin project write model) -->
        <div>
          <div v-if="directReports.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No direct reports found.
          </div>
          <div v-else>
            <div class="relative mb-3">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by name, title, or team..."
                class="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
              <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div v-if="searchQuery && projectFilteredReports.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
              No reports match "{{ searchQuery }}"
            </div>
            <table v-else class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Title</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Team(s)</th>
                </tr>
              </thead>
              <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="report in projectFilteredReports" :key="reportId(report)" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td class="px-4 py-3 text-sm whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                      <button @click="navigateToProjectPerson(report)" class="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                        {{ report.name }}
                      </button>
                      <span
                        v-if="includeIndirect && !directReportUidSet.has(reportId(report))"
                        class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        title="Indirect report"
                      >indirect</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">{{ report.title || '—' }}</td>
                  <td class="px-4 py-3 text-sm">
                    <div v-if="report.teamIds.length > 0">
                      <template v-for="(id, idx) in report.teamIds" :key="id">
                        <span v-if="idx > 0" class="text-gray-400 dark:text-gray-500">, </span>
                        <button
                          v-if="teamById[id]"
                          @click="navigateToProjectTeam(teamById[id])"
                          class="text-primary-600 dark:text-primary-400 hover:underline"
                        >{{ teamById[id].name }}</button>
                        <span v-else class="text-gray-600 dark:text-gray-400">{{ id }}</span>
                      </template>
                    </div>
                    <span v-else class="text-amber-500 dark:text-amber-400">Unassigned</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- My Teams tab -->
      <div v-if="activeTab === 'teams'">
        <!-- Project roster: read-only managed teams with member counts -->
        <div>
          <div v-if="teams.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            None of your direct reports are assigned to a team.
          </div>
          <div v-else>
            <div class="relative mb-3">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                v-model="teamSearchQuery"
                type="text"
                placeholder="Search by team name..."
                class="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
              <button v-if="teamSearchQuery" @click="teamSearchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <X class="w-4 h-4" />
              </button>
            </div>
            <div v-if="teamSearchQuery && projectFilteredTeams.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
              No teams match "{{ teamSearchQuery }}"
            </div>
            <div v-else class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Team</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">My Reports</th>
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Members</th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr v-for="team in projectFilteredTeams" :key="team.id" class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="px-4 py-3 text-sm whitespace-nowrap">
                      <button @click="navigateToProjectTeam(team)" class="text-primary-600 dark:text-primary-400 hover:underline font-medium">{{ team.name }}</button>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ team.directReportCount }}</td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{{ team.totalMemberCount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { useManagerDashboard } from '../composables/useManagerDashboard'

const nav = inject('moduleNav', null)

const { directReports, indirectReports, teams, loading, error, reason, includeIndirect, availability, generatedAt, enrichment, projectId, load, resetState } = useManagerDashboard()

const activeTab = ref('reports')
const searchQuery = ref('')
const teamSearchQuery = ref('')

const visibleReports = computed(() =>
  includeIndirect.value
    ? [...directReports.value, ...indirectReports.value]
    : directReports.value
)

// Reports carry a server-provided `key`; external managers have no accountId.
function reportId(report) {
  return report.key ?? report.accountId
}

const directReportUidSet = computed(() =>
  new Set(directReports.value.map(reportId))
)

const projectStatusLabel = computed(() => {
  if (availability.value === 'available') return 'Supported'
  if (availability.value === 'empty') return 'Empty'
  return 'Unavailable'
})

const enrichmentStatusNote = computed(() => {
  if (!enrichment.value || enrichment.value.state === 'absent') return null
  if (enrichment.value.state === 'stale') return 'Profiles: stale'
  if (enrichment.value.partial) return 'Profiles: partial'
  return null
})

// Guard against a malformed published timestamp rendering as "Invalid Date".
const generatedAtLabel = computed(() => {
  if (!generatedAt.value) return null
  const parsed = new Date(generatedAt.value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString()
})

const teamById = computed(() => {
  const map = {}
  for (const team of teams.value) {
    map[team.id] = team
  }
  return map
})

function matchesReport(report, q) {
  if (report.name?.toLowerCase().includes(q)) return true
  if (report.title?.toLowerCase().includes(q)) return true
  return (report.teamIds || []).some(id => teamById.value[id]?.name?.toLowerCase().includes(q))
}

const projectFilteredReports = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return visibleReports.value
  return visibleReports.value.filter(r => matchesReport(r, q))
})

const projectFilteredTeams = computed(() => {
  const q = teamSearchQuery.value.trim().toLowerCase()
  if (!q) return teams.value
  return teams.value.filter(t => t.name?.toLowerCase().includes(q))
})

function projectTeamKey(team) {
  return `${projectId.value}::${team.id}`
}

function navigateToProjectPerson(report) {
  if (!nav) return
  if (report.accountId) nav.navigateTo('person-detail', { accountId: report.accountId })
  else if (report.ldapUid) nav.navigateTo('person-detail', { ldapUid: report.ldapUid })
}

function navigateToProjectTeam(team) {
  if (nav) nav.navigateTo('team-detail', { teamKey: projectTeamKey(team) })
}

const tabs = computed(() => [
  { id: 'reports', label: 'My Reports', count: visibleReports.value.length },
  { id: 'teams', label: 'My Teams', count: teams.value.length }
])

async function toggleIndirectReports() {
  includeIndirect.value = !includeIndirect.value
  await load()
}

// Switching projects must isolate client state: drop prior data and reload
// against the newly selected project.
watch(projectId, () => {
  activeTab.value = 'reports'
  searchQuery.value = ''
  teamSearchQuery.value = ''
  resetState()
  load()
}, { flush: 'sync' })

onMounted(() => {
  load()
})
</script>
