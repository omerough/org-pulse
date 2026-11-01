import { ref, computed, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

/**
 * Human-readable label for the selected project, from the project registry.
 * Presentation only; falls back to the raw project ID and is empty without a project.
 */
export function useProjectDisplayName() {
  const projectId = useProjectId()
  const resolved = ref({ projectId: '', displayName: '' })
  let requestId = 0

  watch(projectId, async (id) => {
    const current = ++requestId
    if (!id) return
    let displayName = ''
    try {
      const data = await apiRequest('/projects')
      const project = (Array.isArray(data?.projects) ? data.projects : []).find(p => p?.projectId === id)
      if (typeof project?.displayName === 'string') displayName = project.displayName.trim()
    } catch {
      // Discovery failure keeps the raw ID label.
    }
    if (current === requestId) resolved.value = { projectId: id, displayName }
  }, { immediate: true })

  return computed(() => {
    if (!projectId.value) return ''
    return resolved.value.projectId === projectId.value && resolved.value.displayName
      ? resolved.value.displayName
      : projectId.value
  })
}
