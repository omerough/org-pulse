<template>
  <div class="overflow-x-auto">
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
          v-for="member in sortedMembers"
          :key="member.accountId"
          class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
          @click="$emit('select', member)"
        >
          <td class="px-4 py-3 text-sm whitespace-nowrap">
            <a
              :href="personLink(member)"
              class="text-primary-600 hover:underline"
              @click.stop
            >
              {{ member.name }}
            </a>
          </td>
          <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            <span v-if="getMemberMetric(member, 'nameNotFound')" class="text-gray-400 dark:text-gray-500 italic">no Jira user</span>
            <template v-else>{{ getMemberMetric(member, 'resolvedCount') ?? '—' }}</template>
          </td>
          <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            <span v-if="getMemberMetric(member, 'nameNotFound')" class="text-gray-400 dark:text-gray-500 italic">no Jira user</span>
            <template v-else>{{ getMemberMetric(member, 'resolvedPoints') ?? '—' }}</template>
          </td>
          <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            <span v-if="getMemberMetric(member, 'nameNotFound')" class="text-gray-400 dark:text-gray-500 italic">no Jira user</span>
            <template v-else>{{ getMemberMetric(member, 'avgCycleTimeDays') != null ? getMemberMetric(member, 'avgCycleTimeDays') + 'd' : '—' }}</template>
          </td>
          <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            <template v-if="getGithubContribCount(member) != null">{{ getGithubContribCount(member) }}</template>
            <span v-else-if="hasGithubData(member)" class="text-gray-300 dark:text-gray-600">—</span>
            <span v-else class="text-gray-300 dark:text-gray-600 italic text-xs" title="GitHub data not available">no GitHub</span>
          </td>
          <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
            <span class="text-gray-400 dark:text-gray-500 italic text-xs" title="GitLab is not yet supported for canonical projects">Unsupported</span>
          </td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">
            <span
              v-if="getTeamCount(member) > 1"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700"
            >
              {{ getTeamCount(member) }} teams
            </span>
            <span v-else class="text-gray-400 dark:text-gray-500">1</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useModuleLink } from '@shared/client/composables/useModuleLink'
import { useProjectId, projectParam } from '@shared/client/composables/useProjectId'

const { linkTo } = useModuleLink()
const projectId = useProjectId()

const props = defineProps({
  members: { type: Array, required: true },
  getTeamsForPerson: { type: Function, default: () => () => [] },
  memberMetrics: { type: Map, default: () => new Map() },
  teamKey: { type: String, default: null },
  // accountId -> project-qualified contribution record (null when unpublished)
  getGithubContribution: { type: Function, required: true }
})
defineEmits(['select'])

function personLink(member) {
  const params = { ...projectParam(projectId.value), ...(props.teamKey && { teamKey: props.teamKey }) }
  return linkTo('team-tracker', 'person-detail', { ...params, accountId: member.accountId })
}

// The lookback window shared by every displayed member, or null when
// unknown/mixed -- never assert a window the data can't back up.
const commonLookbackDays = computed(() => {
  const values = []
  for (const metrics of props.memberMetrics.values()) {
    if (!metrics) continue
    if (typeof metrics.lookbackDays !== 'number') return null
    values.push(metrics.lookbackDays)
  }
  if (values.length === 0) return null
  return values.every(v => v === values[0]) ? values[0] : null
})

const resolvedColumnLabel = computed(() =>
  commonLookbackDays.value != null ? `Resolved (${commonLookbackDays.value}d)` : 'Resolved'
)
const pointsColumnLabel = computed(() =>
  commonLookbackDays.value != null ? `Points (${commonLookbackDays.value}d)` : 'Points'
)

const columns = computed(() => [
  { key: 'name', label: 'Name' },
  { key: 'resolved', label: resolvedColumnLabel.value },
  { key: 'points', label: pointsColumnLabel.value },
  { key: 'cycleTime', label: 'Cycle Time' },
  { key: 'github', label: 'GitHub (1yr)' },
  { key: 'gitlab', label: 'GitLab (1yr)' },
  { key: 'teams', label: 'Teams' }
])

const sortKey = ref('name')
const sortAsc = ref(true)

function toggleSort(key) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = true
  }
}

function getTeamCount(member) {
  return props.getTeamsForPerson(member.accountId).length || 1
}

function getMemberMetric(member, field) {
  const m = props.memberMetrics.get(member.accountId)
  return m?.[field] ?? null
}

function getGithubContribCount(member) {
  return props.getGithubContribution(member.accountId)?.github?.totalContributions ?? null
}

// Distinguishes "known identity, no number published yet" (shown as —) from
// "no identity at all" (shown as "no GitHub") in the template.
function hasGithubData(member) {
  return props.getGithubContribution(member.accountId) != null
}

const sortedMembers = computed(() => {
  const key = sortKey.value
  const asc = sortAsc.value ? 1 : -1

  return [...props.members].sort((a, b) => {
    let va, vb
    if (key === 'teams') {
      va = getTeamCount(a)
      vb = getTeamCount(b)
    } else if (key === 'resolved') {
      va = getMemberMetric(a, 'resolvedCount') ?? -1
      vb = getMemberMetric(b, 'resolvedCount') ?? -1
    } else if (key === 'points') {
      va = getMemberMetric(a, 'resolvedPoints') ?? -1
      vb = getMemberMetric(b, 'resolvedPoints') ?? -1
    } else if (key === 'cycleTime') {
      va = getMemberMetric(a, 'avgCycleTimeDays') ?? -1
      vb = getMemberMetric(b, 'avgCycleTimeDays') ?? -1
    } else if (key === 'github') {
      va = getGithubContribCount(a) ?? -1
      vb = getGithubContribCount(b) ?? -1
    } else if (key === 'name') {
      va = (a.name || '').toLowerCase()
      vb = (b.name || '').toLowerCase()
    } else {
      return 0 // GitLab has no canonical value to order by
    }
    if (va < vb) return -1 * asc
    if (va > vb) return 1 * asc
    return 0
  })
})
</script>
