import { computed, ref, watch } from 'vue'

/**
 * Reactive project context: the hash query param (projectId), falling back to
 * the default project the shell publishes after project discovery. An empty
 * value therefore means discovery has not finished (or failed), never a
 * legacy unqualified context; the shell renders no project-aware view then.
 */
function readProjectIdFromHash() {
  const raw = window.location.hash || '#/'
  const qIdx = raw.indexOf('?')
  if (qIdx < 0) return ''
  for (const pair of raw.substring(qIdx + 1).split('&')) {
    const eqIdx = pair.indexOf('=')
    const key = eqIdx >= 0 ? pair.substring(0, eqIdx) : pair
    if (decodeURIComponent(key) === 'projectId') {
      const value = eqIdx >= 0 ? pair.substring(eqIdx + 1) : ''
      return decodeURIComponent(value)
    }
  }
  return ''
}

let _projectId = null
const _urlProjectId = ref('')
const _defaultProjectId = ref('')

export function useProjectId() {
  if (_projectId === null) {
    _urlProjectId.value = readProjectIdFromHash()
    _projectId = computed(() => _urlProjectId.value || _defaultProjectId.value)
    const sync = () => {
      _urlProjectId.value = readProjectIdFromHash()
    }
    window.addEventListener('hashchange', sync)
    // The shell writes param-only changes via history.pushState/replaceState,
    // which does not fire hashchange; App dispatches urlchange after those
    // writes so the project context stays in sync with the selector.
    window.addEventListener('urlchange', sync)
  }
  return _projectId
}

/** Published by the shell selector once the project list is known; '' clears it. */
export function setDefaultProjectId(projectId) {
  _defaultProjectId.value = projectId || ''
}

/** Resolves a URL-supplied project (possibly empty) against the default. */
export function resolveProjectId(urlProjectId) {
  return urlProjectId || _defaultProjectId.value
}

export function projectQuery(projectId) {
  return projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
}

export function projectParam(projectId) {
  return projectId ? { projectId } : {}
}

export { watch }
