<template>
  <div>
    <!-- Loading state when team not yet resolved from roster -->
    <div v-if="!team && rosterLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Team not found after roster loaded -->
    <div v-else-if="!team" data-testid="team-not-found" class="flex flex-col items-center justify-center py-12 text-center">
      <svg class="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p class="text-gray-500 dark:text-gray-400 text-sm">This team has no members or could not be found.</p>
      <button
        @click="handleBack()"
        class="mt-4 px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
      >
        {{ fromSotu ? 'Back to Overview' : 'Back to directory' }}
      </button>
    </div>

    <template v-else>
      <!-- Persistent Header -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <button
              @click="handleBack()"
              class="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
              :title="fromSotu ? 'Back to Overview' : 'Back to Dashboard'"
            >
              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ team.displayName }}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ teamOrgName }}<span v-if="uniqueCount"> · {{ uniqueCount }} members</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Bar -->
      <div class="border-b-2 border-gray-200 dark:border-gray-700 mb-6">
        <nav class="flex gap-8">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex items-center gap-2 pb-3 pt-1 text-base font-medium border-b-2 -mb-[2px] transition-colors"
            :class="activeTab === tab.id
              ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
          >
            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" v-html="tab.icon"></svg>
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- Tab Panels -->

      <!-- Overview Tab -->
      <div v-if="tabActivated.overview" v-show="activeTab === 'overview'">
        <TeamOverviewTab :members="uniqueMembers" :teamKey="team?.key" />
      </div>

      <!-- Delivery Tab -->
      <div v-if="tabActivated.delivery" v-show="activeTab === 'delivery'">
        <TeamDeliveryTab
          :team="team"
          :teamMetrics="teamMetrics"
          :teamDisplayName="team.displayName"
          @select-person="handleSelectPerson"
        />
      </div>

      <!-- Autofix Tab -->
      <div v-if="tabActivated.autofix" v-show="activeTab === 'autofix'">
        <TeamAutofixTab :team="team" />
      </div>

    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, inject, watch, nextTick } from 'vue'
import TeamOverviewTab from '../components/TeamOverviewTab.vue'
import TeamDeliveryTab from '../components/TeamDeliveryTab.vue'
import TeamAutofixTab from '../components/autofix/TeamAutofixTab.vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { getTeamMetrics } from '@shared/client/services/api'
import { useManagerTutorial } from '../composables/useManagerTutorial'
import { dedupeMembersByIdentity } from '../utils/member-resolution'
import { resolveLegacyTeamKey } from '../utils/legacy-link-resolution'

const nav = inject('moduleNav')
const { teams: allTeams, rosterData, loading: rosterLoading } = useRoster()
const { resumeTourIfActive, destroyTour } = useManagerTutorial()

const fromSotu = computed(() => nav.params.value?.from === 'sotu')

function handleBack() {
  if (fromSotu.value) {
    window.location.hash = '#/'
  } else {
    nav.goBack()
  }
}

const team = computed(() => {
  const teamKey = nav.params.value?.teamKey
  if (!teamKey) return null
  return allTeams.value.find(t => t.key === teamKey) || null
})

// A legacy team key is rewritten to its canonical key before any metrics call;
// an unresolved key leaves `team` null and renders the not-found state.
watch(
  [() => nav.params.value?.teamKey, team, rosterLoading, rosterData],
  ([teamKey]) => {
    const projectId = rosterData.value?.projectId
    if (!teamKey || team.value || rosterLoading.value || !projectId) return
    const resolved = resolveLegacyTeamKey(rosterData.value, projectId, teamKey)
    if (resolved.teamKey) nav.updateParams({ teamKey: resolved.teamKey }, { push: false })
  },
  { immediate: true }
)

const uniqueMembers = computed(() =>
  team.value ? dedupeMembersByIdentity(team.value.members) : []
)

const uniqueCount = computed(() => uniqueMembers.value.length)

const teamOrgName = computed(() => {
  if (!team.value) return ''
  const sepIdx = team.value.key.indexOf('::')
  return sepIdx !== -1 ? team.value.key.substring(0, sepIdx) : ''
})

// --- Delivery metrics ---
const teamMetrics = ref(null)

// Only the most recently started request may write to `teamMetrics`, so a
// stale response from a prior team/project selection can't overwrite it.
let teamMetricsRequestId = 0
let teamMetricsRequestIdentityKey = null

function teamMetricsIdentityKey() {
  if (!team.value) return null
  // Use the roster's own resolved project, not the shell's hash state (which may be mid-switch).
  return `${rosterData.value?.projectId ?? ''}::${team.value.key}`
}

async function fetchTeamMetrics() {
  if (rosterLoading.value || !team.value) return
  const projectId = rosterData.value?.projectId
  const teamKey = team.value.key
  const identityKey = teamMetricsIdentityKey()
  const requestId = ++teamMetricsRequestId
  if (identityKey !== teamMetricsRequestIdentityKey) {
    teamMetrics.value = null
  }
  teamMetricsRequestIdentityKey = identityKey
  try {
    const result = await getTeamMetrics(teamKey, projectId)
    if (requestId !== teamMetricsRequestId) return // superseded by a newer request
    teamMetrics.value = result
  } catch (error) {
    if (requestId !== teamMetricsRequestId) return // superseded; a stale failure must not clobber newer state
    teamMetricsRequestIdentityKey = null // allow a later trigger for this identity to retry
    console.error('Failed to fetch team metrics:', error)
  }
}

// --- Tabs ---
const activeTab = ref('overview')
const tabActivated = ref({ overview: true, delivery: false, autofix: false })

const TAB_ICONS = {
  overview: '<path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />',
  delivery: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />',
  autofix: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />',
}

// Temporarily hidden from the tab bar; implementation and panel stay in place for restoration.
const HIDDEN_TAB_IDS = ['autofix']

const visibleTabs = [
  { id: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
  { id: 'delivery', label: 'Delivery', icon: TAB_ICONS.delivery },
  { id: 'autofix', label: 'Autofix', icon: TAB_ICONS.autofix },
].filter(tab => !HIDDEN_TAB_IDS.includes(tab.id))

const VALID_TABS = visibleTabs.map(tab => tab.id)
let updatingFromUrl = false

watch(activeTab, (tab) => {
  tabActivated.value[tab] = true
  if (!updatingFromUrl) {
    nav.updateParams({ tab: tab === 'overview' ? undefined : tab })
  }
})

watch(() => nav.params.value?.tab, (tabParam) => {
  const tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview'
  if (activeTab.value !== tab) {
    updatingFromUrl = true
    activeTab.value = tab
    nextTick(() => { updatingFromUrl = false })
  }
}, { immediate: true })

// --- Navigation ---
function handleSelectPerson(member) {
  nav.navigateTo('person-detail', { accountId: member.accountId, teamKey: team.value?.key })
}

// --- Lifecycle ---
onMounted(() => {
  fetchTeamMetrics()
  resumeTourIfActive('team-detail')
})

onBeforeUnmount(() => {
  destroyTour()
})

watch(() => nav.params.value?.teamKey, () => {
  // A legacy-key rewrite changes the param but not the resolved team.
  if (teamMetricsIdentityKey() !== teamMetricsRequestIdentityKey) fetchTeamMetrics()
})

// `team` and `rosterLoading` can flip in one flush, so they share a watcher to avoid duplicate fetches.
watch([team, rosterLoading], ([newTeam, isLoading], [oldTeam, wasLoading]) => {
  if (isLoading) return
  const teamJustResolved = newTeam && !oldTeam
  const rosterJustFinishedLoading = wasLoading && !isLoading
  if (!teamJustResolved && !rosterJustFinishedLoading) return
  if (teamMetricsIdentityKey() !== teamMetricsRequestIdentityKey) fetchTeamMetrics()
})
</script>
