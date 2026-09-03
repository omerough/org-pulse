import { defineAsyncComponent } from 'vue'

// Guards the one-shot reload below. Uses sessionStorage (survives the reload
// itself) plus a short time window rather than a permanent flag, so a stale
// chunk from *this* deploy can't block recovery from a later, unrelated one.
const CHUNK_RELOAD_GUARD_KEY = 'org-pulse:chunk-reload-at'
const CHUNK_RELOAD_GUARD_WINDOW_MS = 10_000

function recentlyReloadedForChunkError() {
  const at = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY))
  return Number.isFinite(at) && Date.now() - at < CHUNK_RELOAD_GUARD_WINDOW_MS
}

/**
 * Recovers from stale-tab chunk-load failures after a deploy.
 *
 * Vite fires `vite:preloadError` on `window` whenever any dynamic import()
 * fails to fetch its chunk. A browser tab left open since before a deploy,
 * requesting a hashed asset the new deploy no longer serves, is the failure
 * mode this specifically addresses — but the event itself is a general
 * preload-failure signal, not proof a deploy happened; other transient
 * fetch failures could also fire it. The one-reload guard below makes
 * reacting to it safe either way. This is a narrower, more reliable signal
 * than pattern-matching error messages, and it fires for every lazy
 * module/view import in the app without each one needing to opt in
 * individually.
 *
 * `event.preventDefault()` stops Vite's preload helper from rethrowing the
 * original error (it only rethrows when the event's default isn't
 * prevented) — safe here because we're reloading the page immediately
 * anyway. One reload is enough to fetch the current index.html/main bundle
 * and thus the new chunk manifest. If the failure recurs within the guard
 * window, it isn't a recoverable stale-deploy case, so we deliberately
 * leave the event unhandled: Vite rethrows and the original error surfaces
 * normally instead of reloading again.
 */
export function installChunkLoadRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    if (recentlyReloadedForChunkError()) return
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()))
    event.preventDefault()
    window.location.reload()
  })
}

const manifestModules = import.meta.glob('/modules/*/module.json', { eager: true })
const clientEntries = import.meta.glob('/modules/*/client/index.js')
const settingsComponents = import.meta.glob('/modules/*/client/components/*Settings.vue')
const widgetComponents = import.meta.glob('/modules/*/client/widgets/*Widget.vue')

export function loadModuleManifests() {
  const modules = []
  for (const [path, manifest] of Object.entries(manifestModules)) {
    const slug = path.split('/')[2]
    modules.push({ ...manifest.default || manifest, slug })
  }
  return modules.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}

export async function loadModuleClient(slug) {
  if (slug.includes('..') || slug.includes('/')) return null
  const loader = clientEntries[`/modules/${slug}/client/index.js`]
  if (!loader) return null
  return loader()
}

export function loadModuleSettingsComponent(slug, settingsPath) {
  // Prevent path traversal in settings component path
  if (settingsPath.includes('..')) {
    throw new Error(`Invalid settings path for module "${slug}": path traversal not allowed`)
  }
  // Normalize ./client/... to client/...
  const normalized = settingsPath.replace(/^\.\//, '')
  const globKey = `/modules/${slug}/${normalized}`
  const loader = settingsComponents[globKey]
  if (!loader) {
    throw new Error(`Settings component not found for module "${slug}": ${globKey}`)
  }
  return defineAsyncComponent(loader)
}

export function loadModuleWidget(slug, widgetPath) {
  if (widgetPath.includes('..')) {
    throw new Error(`Invalid widget path for module "${slug}": path traversal not allowed`)
  }
  const normalized = widgetPath.replace(/^\.\//, '')
  const globKey = `/modules/${slug}/${normalized}`
  const loader = widgetComponents[globKey]
  if (!loader) {
    throw new Error(`Widget component not found for module "${slug}": ${globKey}`)
  }
  return defineAsyncComponent(loader)
}
