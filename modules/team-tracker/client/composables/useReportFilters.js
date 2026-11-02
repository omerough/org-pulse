import { ref, computed, watch, effectScope } from 'vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

// Module-level singleton: selections carry across reports. Reports needing
// independent state declare `filters: []` and manage their own.
const selectedTeamKeys = ref([])

// Selections belong to one project. The reset lives in a detached scope so it
// survives the unmounting of whichever component first used the filters.
let projectScopeStarted = false
function resetSelectionsOnProjectChange() {
  if (projectScopeStarted) return
  projectScopeStarted = true
  effectScope(true).run(() => {
    watch(useProjectId(), () => {
      selectedTeamKeys.value = []
    }, { flush: 'sync' })
  })
}

export function useReportFilters() {
  const { teams: rosterTeams, loadRoster } = useRoster()
  resetSelectionsOnProjectChange()

  // Ensure roster data is loaded (defensive -- App.vue also calls this,
  // but loadRoster() is a no-op if data is already present)
  loadRoster()

  const availableTeams = computed(() =>
    rosterTeams.value
      .map(team => ({
        key: team.key,
        displayName: team.displayName,
        members: team.members,
        memberCount: team.members.length,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  )

  // Drop team selections that are no longer valid when the team list changes.
  watch(availableTeams, () => {
    selectedTeamKeys.value = selectedTeamKeys.value.filter(
      tk => availableTeams.value.some(t => t.key === tk)
    )
  })

  return {
    selectedTeamKeys,
    availableTeams,
  }
}
