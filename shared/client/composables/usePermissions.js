import { ref, computed, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId, projectQuery } from './useProjectId.js'

const permissionData = ref(null)
const loading = ref(true)
const projectId = useProjectId()

let initialized = false
let requestSequence = 0

// Reset immediately on project switch so stale isManager/uid never leaks across projects.
watch(projectId, () => {
  permissionData.value = null
  loading.value = true
  fetchPermissions()
}, { flush: 'sync' })

async function fetchPermissions() {
  const requestId = ++requestSequence
  const requestedProjectId = projectId.value
  try {
    const data = await apiRequest(`/modules/team-tracker/permissions/me${projectQuery(requestedProjectId)}`)
    if (requestId !== requestSequence) return
    permissionData.value = data
  } catch {
    // Server not available
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

export function usePermissions() {
  if (!initialized) {
    initialized = true
    fetchPermissions()
  }

  const roles = computed(() => permissionData.value?.roles || [])
  const managedUids = computed(() => new Set(permissionData.value?.managedUids || []))
  const userUid = computed(() => permissionData.value?.uid || null)
  const isAdmin = computed(() => roles.value.includes('admin'))
  const isTeamAdmin = computed(() =>
    roles.value.includes('admin') || roles.value.includes('team-admin')
  )
  const isManager = computed(() =>
    permissionData.value?.isManager || roles.value.includes('admin')
  )

  function canEdit(uid) {
    if (isAdmin.value) return true
    if (isTeamAdmin.value) return true
    return managedUids.value.has(uid)
  }

  function canEditTeam(_teamId) {
    return isAdmin.value || isTeamAdmin.value
  }

  return {
    loading,
    roles,
    managedUids,
    userUid,
    isAdmin,
    isTeamAdmin,
    isManager,
    canEdit,
    canEditTeam,
    refresh: fetchPermissions
  }
}
