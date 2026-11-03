<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useProjectDisplayName } from '../composables/useProjectDisplayName'
import { useRoster } from '@shared/client/composables/useRoster.js'
import { resolveMemberLocation } from '../utils/member-resolution'

const nav = inject('moduleNav')
const projectId = useProjectId()
const projectLabel = useProjectDisplayName()
const {
  rosterData: projectRosterData,
  error: projectRosterError,
  loadRoster,
  people: rosterPeople,
  teams: rosterTeams
} = useRoster()

const people = ref([])
const loading = ref(true)
const search = ref('')
const selectedGeos = ref([])
const projectRosterMessage = ref(null)
let loadSequence = 0
const projectRosterStatus = computed(() => {
  const roster = projectRosterData.value
  if (projectRosterMessage.value || projectRosterError.value) return 'Unavailable'
  if (!roster || roster.projectId !== projectId.value) return loading.value ? 'Loading' : 'Unavailable'
  if (roster.availability === 'available') return 'Supported'
  if (roster.availability === 'empty') return 'Empty'
  return 'Unavailable'
})
const projectRosterUpdatedAt = computed(() => {
  if (projectRosterData.value?.projectId !== projectId.value) return null
  return projectRosterData.value?.generatedAt || null
})
// state 'absent' means identities were distrusted and nulled for everyone;
// showing GitHub/GitLab counts then would read as a real zero, not "unpublished".
const enrichmentAvailable = computed(() => {
  if (projectRosterData.value?.projectId !== projectId.value) return false
  const enrichment = projectRosterData.value?.enrichment
  return Boolean(enrichment) && enrichment.state !== 'absent'
})
const enrichmentStatusNote = computed(() => {
  if (!enrichmentAvailable.value) return null
  const enrichment = projectRosterData.value.enrichment
  if (enrichment.state === 'stale') return 'Profiles: stale'
  if (enrichment.partial) return 'Profiles: partial'
  return null
})

const sortField = ref('name')
const sortAsc = ref(true)

function personKey(person) {
  return person.rowKey || person.accountId || person.name
}

async function loadData() {
  const requestId = ++loadSequence
  const requestedProjectId = projectId.value
  const isCurrentRequest = () => requestId === loadSequence && projectId.value === requestedProjectId
  loading.value = true
  projectRosterMessage.value = null
  people.value = []

  try {
    const roster = await loadRoster()
    if (!isCurrentRequest()) return
    if (!roster || roster.projectId !== requestedProjectId) {
      projectRosterMessage.value = projectRosterError.value || 'Roster response project identity mismatch.'
      return
    }
    if (roster.availability === 'unavailable') {
      projectRosterMessage.value = roster.reason || 'No current roster publication is available for this project.'
      return
    }
    if (!['available', 'empty'].includes(roster.availability)) {
      projectRosterMessage.value = 'The project roster does not provide a people directory.'
      return
    }

    const teamNameById = new Map(rosterTeams.value.map(t => [t.teamId, t.displayName]))
    people.value = rosterPeople.value.map(person => ({
      rowKey: person.key,
      accountId: person.accountId,
      name: person.displayName,
      status: person.active ? 'active' : 'inactive',
      email: person.email,
      ldapUid: person.ldapUid ?? null,
      title: person.title,
      geo: person.geo,
      location: resolveMemberLocation(person),
      teams: person.teamIds.map(id => teamNameById.get(id)).filter(Boolean),
      github: person.identities?.github ?? null,
      gitlab: person.identities?.gitlab ?? null
    }))
  } catch (error) {
    if (isCurrentRequest()) {
      people.value = []
      projectRosterMessage.value = error.message
    }
  } finally {
    if (isCurrentRequest()) loading.value = false
  }
}

const geos = computed(() => {
  const set = new Set()
  for (const p of people.value) {
    if (p.geo) set.add(p.geo)
  }
  return Array.from(set).sort()
})

const filtered = computed(() => {
  let list = people.value.filter(p => p.status === 'active')

  if (selectedGeos.value.length > 0) {
    const geoSet = new Set(selectedGeos.value)
    list = list.filter(p => geoSet.has(p.geo))
  }
  if (search.value) {
    const term = search.value.toLowerCase()
    list = list.filter(p => {
      const searchable = [
        p.name, p.email, p.ldapUid,
        p.github ? p.github.username : '',
        p.gitlab ? p.gitlab.username : '',
        personTeamDisplay(p)
      ].join(' ').toLowerCase()
      return searchable.includes(term)
    })
  }

  return [...list].sort((a, b) => {
    const av = sortField.value === 'teams' ? personTeamDisplay(a) : a[sortField.value] || ''
    const bv = sortField.value === 'teams' ? personTeamDisplay(b) : b[sortField.value] || ''
    const cmp = String(av).localeCompare(String(bv))
    return sortAsc.value ? cmp : -cmp
  })
})

const filteredStats = computed(() => {
  const list = filtered.value
  return {
    total: list.length,
    github: list.filter(p => p.github && p.github.username).length,
    gitlab: list.filter(p => p.gitlab && p.gitlab.username).length
  }
})

function personTeamDisplay(p) {
  return (p.teams || []).join(', ')
}

function toggleSort(field) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

function sortIcon(field) {
  if (sortField.value !== field) return ''
  return sortAsc.value ? ' \u25B2' : ' \u25BC'
}

function openPerson(p) {
  nav.navigateTo('person-detail', { accountId: p.accountId })
}

function exportCsv() {
  // Same availability gate as the stat tiles: omit the columns entirely when
  // unavailable, rather than exporting blanks that would read as "no identity".
  const includeIdentityColumns = enrichmentAvailable.value
  const rows = [['Project', 'Name', 'Title', 'Geo', 'Location', 'Team(s)', ...(includeIdentityColumns ? ['GitHub', 'GitLab'] : [])]]
  for (const p of filtered.value) {
    rows.push([
      projectLabel.value, p.name, p.title || '', p.geo || '', p.location || '', personTeamDisplay(p),
      ...(includeIdentityColumns ? [p.github ? p.github.username : '', p.gitlab ? p.gitlab.username : ''] : [])
    ])
  }
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'people-' + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(loadData)
watch(projectId, () => {
  search.value = ''
  selectedGeos.value = []
  projectRosterMessage.value = null
  loading.value = true
  loadData()
}, { flush: 'sync' })
</script>

<template>
  <div>
    <p class="mb-4 text-xs text-gray-500 dark:text-gray-400" role="status">
      {{ projectRosterStatus }}
      <span v-if="projectRosterUpdatedAt"> · Updated {{ new Date(projectRosterUpdatedAt).toLocaleString() }}</span>
      <span v-if="enrichmentStatusNote"> · {{ enrichmentStatusNote }}</span>
    </p>

    <!-- Stats header -->
    <div v-if="!loading && people.length > 0" class="grid gap-4 mb-6" :class="enrichmentAvailable ? 'grid-cols-3' : 'grid-cols-1'">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ filteredStats.total }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">People</div>
      </div>
      <div v-if="enrichmentAvailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-green-600">{{ filteredStats.github }} <span class="text-sm font-normal text-gray-400">/ {{ filteredStats.total }}</span></div>
        <div class="text-xs text-gray-500 dark:text-gray-400">GitHub IDs <span class="text-green-600 font-medium">{{ filteredStats.total ? Math.round(filteredStats.github / filteredStats.total * 100) : 0 }}%</span></div>
      </div>
      <div v-if="enrichmentAvailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-orange-600">{{ filteredStats.gitlab }} <span class="text-sm font-normal text-gray-400">/ {{ filteredStats.total }}</span></div>
        <div class="text-xs text-gray-500 dark:text-gray-400">GitLab IDs <span class="text-orange-600 font-medium">{{ filteredStats.total ? Math.round(filteredStats.gitlab / filteredStats.total * 100) : 0 }}%</span></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && people.length === 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
        {{ projectRosterStatus === 'Unavailable' ? 'People roster unavailable' : 'No People Published' }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ projectRosterMessage || 'The published project roster has no active people.' }}
      </p>
    </div>

    <!-- Search + Filters + Table -->
    <div v-else-if="!loading" class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex-1 relative">
        <input
          v-model="search"
          type="text"
          placeholder="Search by name, email, UID, GitHub, or GitLab..."
            class="w-full pl-4 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <button @click="exportCsv" class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0">Export CSV</button>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-start gap-6">
        <!-- Geos -->
        <div v-if="geos.length > 0">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Geo</label>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <label
              v-for="geo in geos"
              :key="geo"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
            >
              <input
                type="checkbox"
                :value="geo"
                v-model="selectedGeos"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ geo }}</span>
            </label>
          </div>
        </div>

        <span class="text-sm text-gray-500 dark:text-gray-400 self-center ml-auto">{{ filtered.length }} results</span>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Project</th>
                <th @click="toggleSort('name')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">Name{{ sortIcon('name') }}</th>
                <th @click="toggleSort('title')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden md:table-cell">Title{{ sortIcon('title') }}</th>
                <th @click="toggleSort('geo')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden lg:table-cell">Geo{{ sortIcon('geo') }}</th>
                <th @click="toggleSort('location')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden lg:table-cell">Location{{ sortIcon('location') }}</th>
                <th @click="toggleSort('teams')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">Team(s){{ sortIcon('teams') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="p in filtered"
                :key="personKey(p)"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                @click="openPerson(p)"
              >
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ projectLabel }}</td>
                <td class="px-4 py-3">
                  <span class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">{{ p.name }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ p.title || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{{ p.geo || '—' }}</td>
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{{ p.location }}</td>
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ personTeamDisplay(p) || '\u2014' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  </div>
</template>
