import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

/** `registryProjectId` may be explicit even when the shell's project id is empty. */
export function useReleaseRegistry() {
  const releases = ref([])
  const error = ref(null)
  const shellProjectId = useProjectId()
  let latestRequestId = 0

  async function loadRegistry(registryProjectId) {
    const requestId = ++latestRequestId
    const requestedShellProjectId = shellProjectId.value
    const isCurrent = () => requestId === latestRequestId && shellProjectId.value === requestedShellProjectId

    releases.value = []
    error.value = null
    try {
      const data = await apiRequest(`/modules/releases/registry${projectQuery(registryProjectId)}`)
      if (!isCurrent()) return
      releases.value = Array.isArray(data?.releases) ? data.releases : []
    } catch (err) {
      if (!isCurrent()) return
      error.value = err.message || 'Release registry unavailable'
    }
  }

  return { releases, error, loadRegistry }
}
