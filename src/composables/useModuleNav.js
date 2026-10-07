import { ref } from 'vue'
import { useProjectId, projectParam } from '@shared/client/composables/useProjectId.js'

export function getDefaultViewId(manifest) {
  const defaultNav = manifest.client?.navItems?.find(n => n.default)
  return defaultNav?.id || manifest.client?.navItems?.[0]?.id || 'dashboard'
}

/**
 * Resolves a view to its section's root, via the same navItems/hiddenRoutes
 * metadata AppSidebar uses for active-item highlighting.
 */
export function resolveSectionRootViewId(manifest, viewId, params = {}) {
  const navItems = manifest.client?.navItems || []
  if (navItems.some(item => item.id === viewId)) return viewId

  const target = manifest.client?.hiddenRoutes?.[viewId]
  if (typeof target === 'string') {
    if (target.startsWith('$')) {
      const resolved = params[target.slice(1)]
      if (resolved) return resolved
    } else {
      return target
    }
  }

  return getDefaultViewId(manifest)
}

function parseHash(hash) {
  const raw = (hash || '#/').slice(2)
  const qIdx = raw.indexOf('?')
  const pathPart = qIdx >= 0 ? raw.substring(0, qIdx) : raw
  const queryPart = qIdx >= 0 ? raw.substring(qIdx + 1) : ''
  const params = {}
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const eqIdx = pair.indexOf('=')
      if (eqIdx >= 0) {
        params[decodeURIComponent(pair.substring(0, eqIdx))] = decodeURIComponent(pair.substring(eqIdx + 1))
      } else if (pair) {
        params[decodeURIComponent(pair)] = ''
      }
    }
  }
  return { pathPart, params }
}

function buildHash(pathPart, params) {
  let hash = `#/${pathPart}`
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  if (qs) hash += `?${qs}`
  return hash
}

/**
 * Builds the shell's `moduleNav` injection (hash-based router for built-in modules).
 * A projectId change resets to the current section's root view here, centrally.
 */
export function createModuleNav({ activeModuleSlugRef, builtInManifests }) {
  const routeParams = ref({})

  function navigateTo(viewId, params = {}) {
    const slug = activeModuleSlugRef.value
    if (!slug) return
    // Preserve the shell project context across module navigation unless
    // the caller explicitly passes a different projectId
    const merged = { ...projectParam(useProjectId().value), ...params }
    routeParams.value = merged
    window.location.hash = buildHash(`${slug}/${viewId}`, merged)
  }

  function updateParams(newParams, { push = true } = {}) {
    const { pathPart, params } = parseHash(window.location.hash)

    const previousProjectId = params.projectId
    const requestsProjectId = Object.prototype.hasOwnProperty.call(newParams, 'projectId')
      && newParams.projectId !== undefined && newParams.projectId !== null
    const isProjectSwitch = requestsProjectId
      && !!previousProjectId
      && String(newParams.projectId) !== previousProjectId

    if (isProjectSwitch) {
      const [moduleSlug, viewId] = pathPart.split('/')
      const manifest = builtInManifests.value.find(m => m.slug === moduleSlug)
      if (manifest?.client?.resetSectionOnProjectSwitch) {
        navigateTo(resolveSectionRootViewId(manifest, viewId, params), { projectId: newParams.projectId })
        return
      }
    }

    for (const [k, v] of Object.entries(newParams)) {
      if (v === undefined || v === null) {
        delete params[k]
      } else {
        params[k] = String(v)
      }
    }
    routeParams.value = { ...params }
    const newHash = buildHash(pathPart, params)
    const method = push ? 'pushState' : 'replaceState'
    history[method](null, '', newHash)
    // history writes do not fire hashchange; hash-query listeners
    // (useProjectId) rely on this signal to pick up the new params
    window.dispatchEvent(new Event('urlchange'))
  }

  function goBack() {
    history.back()
  }

  function isModuleAvailable(slug) {
    return builtInManifests.value.some(m => m.slug === slug)
  }

  return { routeParams, navigateTo, updateParams, goBack, isModuleAvailable }
}
