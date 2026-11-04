<template>
  <div>
    <!-- Team Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-2">
      <MetricCard
        label="Issues Resolved"
        :value="teamMetrics?.aggregate?.resolvedCount"
        :subtitle="deliveryWindowSubtitle"
        clickable
        @click="showResolvedIssues = true"
      />
      <MetricCard
        label="Story Points"
        :value="teamMetrics?.aggregate?.resolvedPoints"
        unit="pts"
        :subtitle="deliveryWindowSubtitle"
      />
      <MetricCard
        label="In Progress"
        :value="teamMetrics?.aggregate?.inProgressCount"
        :warning="teamMetrics?.aggregate?.inProgressCount != null && teamMetrics.aggregate.inProgressCount > uniqueCount"
        clickable
        @click="showInProgressIssues = true"
      />
      <MetricCard
        label="Avg Cycle Time"
        :value="teamMetrics?.aggregate?.avgCycleTimeDays"
        unit="days"
      />
      <MetricCard
        label="GitHub Contributions"
        :value="teamGithubTotal"
        :subtitle="githubSubtitle"
      />
      <MetricCard
        label="GitLab Contributions"
        value="Unsupported"
        tooltip="GitLab contributions are not yet published for canonical (project-qualified) teams."
      />
    </div>

    <!-- Export -->
    <div class="flex justify-end mb-3">
      <button
        @click="exportCsv"
        :disabled="!teamMetrics"
        class="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export CSV
      </button>
    </div>

    <!-- Content -->
    <PersonTable
      :members="uniqueMembers"
      :getTeamsForPerson="getTeamsForPerson"
      :memberMetrics="memberMetricsMap"
      :teamKey="team?.key"
      :getGithubContribution="getProjectContribution"
      @select="$emit('select-person', $event)"
    />

    <!-- In-Progress Issues Modal -->
    <InProgressIssuesModal
      v-if="showInProgressIssues"
      :title="`${teamDisplayName} — In-Progress Issues`"
      :issues="inProgressIssuesForModal"
      @close="showInProgressIssues = false"
    />

    <!-- Resolved Issues Modal -->
    <ResolvedIssuesModal
      v-if="showResolvedIssues"
      :title="`${teamDisplayName} — Resolved Issues`"
      :issues="resolvedIssuesForModal"
      @close="showResolvedIssues = false"
    />

  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import PersonTable from './PersonTable.vue'
import MetricCard from './MetricCard.vue'
import ResolvedIssuesModal from './ResolvedIssuesModal.vue'
import InProgressIssuesModal from './InProgressIssuesModal.vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId'
import { useProjectContributions } from '@shared/client/composables/useProjectContributions'

const props = defineProps({
  team: { type: Object, required: true },
  teamMetrics: { type: Object, default: null },
  teamDisplayName: { type: String, default: '' }
})

defineEmits(['select-person'])

const { getTeamsForPerson } = useRoster()
const { getByAccountId: getProjectContribution, loadContributions: loadProjectContributions } = useProjectContributions()
const projectId = useProjectId()

// No-op without a project context; shares its cache with any other
// view that already loaded this project's contributions this session.
onMounted(loadProjectContributions)
watch(projectId, loadProjectContributions)

const showResolvedIssues = ref(false)
const showInProgressIssues = ref(false)
const uniqueMembers = computed(() => {
  if (!props.team) return []
  const seen = new Set()
  return props.team.members.filter(m => {
    if (seen.has(m.accountId)) return false
    seen.add(m.accountId)
    return true
  })
})

const uniqueCount = computed(() => uniqueMembers.value.length)

const memberMetricsMap = computed(() => {
  const map = new Map()
  if (props.teamMetrics?.members) {
    for (const m of props.teamMetrics.members) {
      if (m.metrics) {
        map.set(m.accountId, m.metrics)
      }
    }
  }
  return map
})

const accountIdToName = computed(() => {
  const map = new Map()
  for (const m of uniqueMembers.value) {
    map.set(m.accountId, m.name)
  }
  return map
})

// Canonical issues carry accountId, not a display name; resolve it here from the roster join.
function withResolvedAssignee(issues) {
  return issues.map(issue => ({
    ...issue,
    assignee: accountIdToName.value.get(issue.accountId) || issue.accountId || null
  }))
}

const resolvedIssuesForModal = computed(() => withResolvedAssignee(props.teamMetrics?.resolvedIssues || []))
const inProgressIssuesForModal = computed(() => withResolvedAssignee(props.teamMetrics?.inProgressIssues || []))

// The total only counts members with a resolved identity; null (not 0) when none resolved.
const teamGithubTotal = computed(() => {
  let sum = 0
  let any = false
  for (const m of uniqueMembers.value) {
    const total = getProjectContribution(m.accountId)?.github?.totalContributions
    if (typeof total === 'number') {
      sum += total
      any = true
    }
  }
  return any ? sum : null
})

// The aggregate spans the whole team, so a window is only asserted when every
// roster member has a published record reporting the same known lookback.
const canonicalLookbackDays = computed(() => {
  const metrics = props.teamMetrics
  if (!metrics?.members) return null
  const published = new Map()
  for (const m of metrics.members) {
    if (m.metrics) published.set(m.accountId, m.metrics.lookbackDays)
  }
  if (typeof metrics.memberCount === 'number' && metrics.memberCount > published.size) return null
  let window = null
  for (const member of uniqueMembers.value) {
    const days = published.get(member.accountId)
    if (typeof days !== 'number') return null
    if (window !== null && days !== window) return null
    window = days
  }
  return window
})

const deliveryWindowSubtitle = computed(() => {
  const days = canonicalLookbackDays.value
  if (days == null) return ''
  return days === 365 ? 'Last year' : `Last ${days} days`
})

const githubSubtitle = computed(() => {
  const availableCount = uniqueMembers.value.filter(m => typeof getProjectContribution(m.accountId)?.github?.totalContributions === 'number').length
  return availableCount < uniqueCount.value ? `${availableCount}/${uniqueCount.value} with data` : 'Last year'
})

function exportCsv() {
  const headers = ['Name', 'Issues Resolved', 'Story Points', 'Avg Cycle Time (days)', 'In Progress', 'GitHub Contributions (1yr)', 'GitLab Contributions (1yr)', 'Teams']
  const rows = uniqueMembers.value.map(member => {
    const metrics = memberMetricsMap.value.get(member.accountId)
    const teamCount = getTeamsForPerson(member.accountId).length
    const ghCount = getProjectContribution(member.accountId)?.github?.totalContributions ?? ''
    return [
      member.name,
      metrics?.resolvedCount ?? '',
      metrics?.resolvedPoints ?? '',
      metrics?.avgCycleTimeDays ?? '',
      metrics?.inProgressCount ?? '',
      ghCount,
      'Unsupported',
      teamCount
    ]
  })

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const teamSlug = props.teamDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  a.download = `${teamSlug}-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
