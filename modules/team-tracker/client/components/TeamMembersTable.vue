<template>
  <div class="overflow-x-auto">
    <!-- Search -->
    <div class="relative mb-4">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by name, manager, role, location..."
        class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      />
    </div>

    <!-- Region / Country filters -->
    <div v-if="uniqueRegions.length > 1 || uniqueCountries.length > 1" class="mb-4 flex flex-wrap gap-2">
      <select
        v-if="uniqueRegions.length > 1"
        v-model="regionFilter"
        class="h-[34px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
      >
        <option :value="null">All Regions</option>
        <option v-for="region in uniqueRegions" :key="region" :value="region">{{ region }}</option>
      </select>
      <select
        v-if="uniqueCountries.length > 1"
        v-model="countryFilter"
        class="h-[34px] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
      >
        <option :value="null">All Countries</option>
        <option v-for="country in uniqueCountries" :key="country" :value="country">{{ country }}</option>
      </select>
    </div>

    <!-- Filter by role -->
    <div v-if="uniqueRoles.length > 1" class="mb-4 flex flex-wrap gap-2">
      <button
        @click="emit('update:roleFilter', null)"
        class="px-3 py-1 rounded text-xs font-medium transition-colors border"
        :class="!props.roleFilter
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'"
      >
        All roles
      </button>
      <button
        v-for="role in uniqueRoles"
        :key="role"
        @click="emit('update:roleFilter', role)"
        class="px-3 py-1 rounded text-xs font-medium transition-colors border"
        :class="props.roleFilter === role
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'"
      >
        {{ role }}
      </button>
    </div>

    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-800">
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
            @click="toggleSort(col.key)"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key" class="ml-1">{{ sortAsc ? '↑' : '↓' }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
        <tr
          v-for="(member, idx) in sortedMembers"
          :key="member.accountId"
          class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <td class="px-4 py-3 text-sm whitespace-nowrap">
            <a
              :href="personLink(member)"
              :data-tour="idx === 0 ? 'first-member-link' : undefined"
              class="text-primary-600 hover:underline"
              @click.stop
            >
              {{ member.name }}
            </a>
          </td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">
            <a
              v-if="managerLink(member)"
              :href="managerLink(member)"
              class="text-primary-600 hover:underline"
              @click.stop
            >{{ getManagerName(member) }}</a>
            <span v-else class="text-gray-600 dark:text-gray-400">{{ getManagerName(member) }}</span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ getSpecialty(member) }}</td>
          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ member.geo || '—' }}</td>
          <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ getLocation(member) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="sortedMembers.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
      {{ searchQuery ? `No members match "${searchQuery}"` : 'No members found.' }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useModuleLink } from '@shared/client/composables/useModuleLink'
import { useProjectId, projectParam } from '@shared/client/composables/useProjectId'
import { useRoster } from '@shared/client/composables/useRoster'
import {
  resolveMemberRole,
  resolveMemberManager,
  resolveMemberLocation,
  UNKNOWN_ROLE
} from '../utils/member-resolution'

const { linkTo } = useModuleLink()
const { people, auxiliaryManagers } = useRoster()
const projectId = useProjectId()

const props = defineProps({
  members: { type: Array, required: true },
  teamKey: { type: String, default: null },
  roleFilter: { type: String, default: null }
})

const emit = defineEmits(['update:roleFilter'])

// Names are never joined by display string. The accountId lookup is built
// once so resolution is O(members + people).
const managerCtx = computed(() => ({
  peopleByAccountId: new Map((people?.value || []).map(p => [p.accountId, p])),
  auxiliaryManagers: auxiliaryManagers?.value || {},
  projectId: projectId.value
}))

const resolvedManagers = computed(() => {
  const ctx = managerCtx.value
  const map = new Map()
  for (const member of props.members) {
    map.set(member, resolveMemberManager(member, ctx))
  }
  return map
})

function getManagerName(member) {
  return resolvedManagers.value.get(member)?.name || '—'
}

function managerLink(member) {
  const resolved = resolvedManagers.value.get(member)
  if (!resolved?.link) return null
  return linkTo('team-tracker', 'person-detail', { ...projectParam(projectId.value), ...resolved.link })
}

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'manager', label: 'Manager' },
  { key: 'specialty', label: 'Role' },
  { key: 'geo', label: 'Region' },
  { key: 'location', label: 'Location' },
]

function personLink(member) {
  const params = { ...projectParam(projectId.value), ...(props.teamKey && { teamKey: props.teamKey }) }
  return linkTo('team-tracker', 'person-detail', { ...params, accountId: member.accountId })
}

function getSpecialty(member) {
  return resolveMemberRole(member) || '—'
}

function getLocation(member) {
  return resolveMemberLocation(member) || '—'
}

const sortKey = ref('name')
const sortAsc = ref(true)
const regionFilter = ref(null)
const countryFilter = ref(null)
const searchQuery = ref('')

function toggleSort(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

const uniqueRoles = computed(() => {
  const roles = new Set()
  for (const m of props.members) {
    const spec = getSpecialty(m)
    if (spec && spec !== '—') roles.add(spec)
  }
  return [...roles].sort()
})

const uniqueRegions = computed(() => {
  const regions = new Set()
  for (const m of props.members) {
    if (m.geo) regions.add(m.geo)
  }
  return [...regions].sort()
})

const uniqueCountries = computed(() => {
  const countries = new Set()
  for (const m of props.members) {
    if (m.country) countries.add(m.country)
  }
  return [...countries].sort()
})

const sortedMembers = computed(() => {
  let result = props.members
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      getManagerName(m).toLowerCase().includes(q) ||
      getSpecialty(m).toLowerCase().includes(q) ||
      (m.geo || '').toLowerCase().includes(q) ||
      getLocation(m).toLowerCase().includes(q)
    )
  }
  if (props.roleFilter) {
    // Missing roles map to Unknown so the Headcount chart's Unknown bucket filters correctly.
    result = result.filter(m => (resolveMemberRole(m) || UNKNOWN_ROLE) === props.roleFilter)
  }
  if (regionFilter.value) {
    result = result.filter(m => m.geo === regionFilter.value)
  }
  if (countryFilter.value) {
    result = result.filter(m => m.country === countryFilter.value)
  }

  return [...result].sort((a, b) => {
    let aVal, bVal
    if (sortKey.value === 'specialty') {
      aVal = getSpecialty(a)
      bVal = getSpecialty(b)
    } else if (sortKey.value === 'manager') {
      aVal = getManagerName(a)
      bVal = getManagerName(b)
    } else if (sortKey.value === 'geo') {
      aVal = a.geo
      bVal = b.geo
    } else if (sortKey.value === 'location') {
      aVal = getLocation(a)
      bVal = getLocation(b)
    } else {
      aVal = a[sortKey.value]
      bVal = b[sortKey.value]
    }
    aVal = (aVal || '').toString().toLowerCase()
    bVal = (bVal || '').toString().toLowerCase()
    const cmp = aVal.localeCompare(bVal)
    return sortAsc.value ? cmp : -cmp
  })
})
</script>
