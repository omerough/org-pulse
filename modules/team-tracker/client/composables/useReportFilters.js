import { ref, computed, watch, effectScope } from 'vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

// Module-level singleton filter state (intentional -- provides continuity
// across reports). Reports needing independent state declare `filters: []`
// in the registry and manage their own selections internally.
const selectedOrgKeys = ref([])
const selectedTeamKeys = ref([])

// Selections belong to one project. The reset lives in a detached scope so it
// survives the unmounting of whichever component first used the filters.
let projectScopeStarted = false
function resetSelectionsOnProjectChange() {
  if (projectScopeStarted) return
  projectScopeStarted = true
  effectScope(true).run(() => {
    watch(useProjectId(), () => {
      selectedOrgKeys.value = []
      selectedTeamKeys.value = []
    }, { flush: 'sync' })
  })
}

export function useReportFilters() {
  const { orgs, isNormalizedModel, teams: rosterTeams, loadRoster } = useRoster()
  resetSelectionsOnProjectChange()

  // Ensure roster data is loaded (defensive -- App.vue also calls this,
  // but loadRoster() is a no-op if data is already present)
  loadRoster()

  // The legacy model builds from orgs, not useRoster().teams, since the latter is
  // pre-filtered by the singleton selectedOrgKey ref.
  const allTeams = computed(() => {
    if (isNormalizedModel.value) {
      return rosterTeams.value
        .map(team => ({
          key: team.key,
          displayName: team.displayName,
          orgKey: null,
          orgDisplayName: null,
          members: team.members,
          memberCount: team.members.length,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    }

    const result = []
    for (const org of orgs.value) {
      if (!org.teams) continue
      for (const [name, team] of Object.entries(org.teams)) {
        const members = team.members || []
        result.push({
          key: `${org.key}::${name}`,
          displayName: team.displayName,
          orgKey: org.key,
          orgDisplayName: org.displayName || org.key,
          members,
          memberCount: members.length,
        })
      }
    }
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName))
  })

  // Project teams have orgKey: null, so org filtering must not apply to them.
  const availableTeams = computed(() => {
    if (isNormalizedModel.value || selectedOrgKeys.value.length === 0) return allTeams.value
    return allTeams.value.filter(t =>
      selectedOrgKeys.value.includes(t.orgKey)
    )
  })

  // Drop team selections that are no longer valid when the team list changes
  // (org filter change, or switching between the legacy roster and a project).
  watch(availableTeams, () => {
    selectedTeamKeys.value = selectedTeamKeys.value.filter(
      tk => availableTeams.value.some(t => t.key === tk)
    )
  })

  return {
    orgs,
    selectedOrgKeys,
    selectedTeamKeys,
    allTeams,
    availableTeams,
  }
}
