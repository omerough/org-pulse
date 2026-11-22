/**
 * Drives the real App shell with a module whose client is still loading
 * (a first visit) while the user navigates on to an already-loaded module.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.hoisted(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
})

const clientGate = vi.hoisted(() => ({ aiImpact: null }))

vi.mock('../module-loader', async (importOriginal) => {
  const { h } = await import('vue')
  const view = (name) => ({ name, render: () => h('div', { 'data-view': name }) })
  const routes = {
    releases: { 'feature-detail': view('ReleasesFeatureDetail') },
    'ai-impact': { 'prd-review': view('AiImpactPrdReview') }
  }
  return {
    ...(await importOriginal()),
    loadModuleManifests: () => [
      { slug: 'releases', name: 'Releases', client: { navItems: [{ id: 'feature-detail', label: 'Feature Detail', default: true }] } },
      { slug: 'ai-impact', name: 'AI Impact', client: { navItems: [{ id: 'prd-review', label: 'PRD Review', default: true }] } }
    ],
    loadModuleClient: async (slug) => {
      if (slug === 'ai-impact') await clientGate.aiImpact.promise
      return { routes: routes[slug] }
    }
  }
})

import App from '../components/App.vue'

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body }
}

function stubBackend() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.endsWith('/whoami')) return jsonResponse({ email: 'dev@example.com', isAdmin: false })
    if (url.endsWith('/projects')) return jsonResponse({ projects: [{ projectId: 'osac', displayName: 'OSAC' }] })
    if (url.endsWith('/built-in-modules/state')) return jsonResponse({ enabledSlugs: ['releases', 'ai-impact'] })
    if (url.endsWith('/built-in-modules/manifests')) return jsonResponse({ modules: [] })
    return jsonResponse({})
  }))
}

async function navigate(hash) {
  window.location.hash = hash
  window.dispatchEvent(new Event('urlchange'))
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await flushPromises()
}

describe('module navigation race', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('does not let a slow module load replace a newer navigation', async () => {
    let releaseAiImpactClient
    clientGate.aiImpact = { promise: new Promise(resolve => { releaseAiImpactClient = resolve }) }
    stubBackend()

    window.location.hash = '#/releases/feature-detail?key=TEST1-1168&projectId=osac'
    window.dispatchEvent(new Event('urlchange'))
    const wrapper = mount(App, { global: { stubs: { SettingsView: true, AboutView: true, ApiTokensView: true } } })
    await vi.waitFor(() => expect(wrapper.find('[data-view="ReleasesFeatureDetail"]').exists()).toBe(true))

    await navigate('#/ai-impact/prd-review?select=RHAIRFE-1001&projectId=osac')
    await navigate('#/releases/feature-detail?key=TEST1-208&projectId=osac')
    expect(wrapper.find('[data-view="ReleasesFeatureDetail"]').exists()).toBe(true)

    releaseAiImpactClient()
    await flushPromises()

    expect(wrapper.find('[data-view="AiImpactPrdReview"]').exists()).toBe(false)
    expect(wrapper.find('[data-view="ReleasesFeatureDetail"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
