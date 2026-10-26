/**
 * Drives the real App shell (sidebar, project selector, hash routing,
 * useProjectId) with the real CiDutyWidget as the Home view, so a lost
 * projectId shows up as a CI Duty request without it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.hoisted(() => {
  window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
})

vi.mock('../module-loader', async (importOriginal) => {
  const StubView = { name: 'StubView', render: () => null }
  return {
    ...(await importOriginal()),
    loadModuleManifests: () => [{
      slug: 'releases',
      name: 'Releases',
      client: { navItems: [{ id: 'execute', label: 'Execute', default: true }] }
    }],
    loadModuleClient: async () => ({ routes: { execute: StubView } })
  }
})

vi.mock('../components/LandingPage.vue', async () => ({
  default: (await import('../../modules/system-health/client/widgets/CiDutyWidget.vue')).default
}))

import App from '../components/App.vue'

const twoProjects = [
  { projectId: 'osac', displayName: 'OSAC' },
  { projectId: 'flightctl', displayName: 'Flight Control' }
]

const activeOsacDuty = {
  projectId: 'osac',
  state: 'ready',
  entries: [{ lead: 'Osac Lead', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-12-31' }]
}

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function ciDutyResponse(url) {
  const projectId = new URL(url, 'http://localhost').searchParams.get('projectId')
  if (!projectId) return jsonResponse({ projectId: null, state: 'unavailable', data: null })
  if (projectId === 'osac') return jsonResponse(activeOsacDuty)
  return jsonResponse({ projectId, state: 'inapplicable', data: null })
}

function stubBackend(projects) {
  const fetchMock = vi.fn(async (url) => {
    if (url.includes('/modules/system-health/ci-duty')) return ciDutyResponse(url)
    if (url.endsWith('/whoami')) return jsonResponse({ email: 'dev@example.com', isAdmin: false })
    if (url.endsWith('/projects')) return jsonResponse({ projects })
    if (url.endsWith('/built-in-modules/state')) return jsonResponse({ enabledSlugs: ['releases', 'system-health'] })
    if (url.endsWith('/built-in-modules/manifests')) return jsonResponse({ modules: [] })
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function ciDutyRequests(fetchMock) {
  return fetchMock.mock.calls.map(([url]) => url).filter(url => url.includes('/ci-duty'))
}

async function mountApp(initialHash) {
  window.location.hash = initialHash
  const wrapper = mount(App, { global: { stubs: { SettingsView: true, AboutView: true, ApiTokensView: true } } })
  await vi.waitFor(() => expect(wrapper.find('nav, aside').exists()).toBe(true))
  await flushPromises()
  return wrapper
}

async function sidebarNavigate(wrapper, target) {
  wrapper.findComponent({ name: 'AppSidebar' }).vm.$emit('navigate', target)
  await flushPromises()
}

async function clickSidebar(wrapper, label) {
  const button = wrapper.findAll('button').find(b => b.text().trim() === label)
  expect(button, `sidebar button "${label}"`).toBeTruthy()
  await button.trigger('click')
  await flushPromises()
}

describe('shell navigation keeps the project context', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('OSAC module -> Home -> CI Duty loads with projectId=osac, no refresh', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=osac')
    expect(window.location.hash).toBe('#/releases/execute?projectId=osac')

    fetchMock.mockClear()
    await clickSidebar(wrapper, 'Home')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))
    expect(window.location.hash).toBe('#/?projectId=osac')
    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
    expect(ciDutyRequests(fetchMock)).toEqual(['/api/modules/system-health/ci-duty?projectId=osac'])
    wrapper.unmount()
  })

  it('Flight Control stays isolated: Home requests projectId=flightctl and shows inapplicable', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=flightctl')

    fetchMock.mockClear()
    await clickSidebar(wrapper, 'Home')

    await vi.waitFor(() => expect(wrapper.text()).toContain('CI Duty is not applicable to this project.'))
    expect(window.location.hash).toBe('#/?projectId=flightctl')
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
    expect(wrapper.text()).not.toContain('Osac Lead')
    expect(ciDutyRequests(fetchMock)).toEqual(['/api/modules/system-health/ci-duty?projectId=flightctl'])
    wrapper.unmount()
  })

  it('switching project on Home reloads CI Duty for the new project and Home keeps it', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=osac')
    await clickSidebar(wrapper, 'Home')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))

    await wrapper.find('select#project-selector').setValue('flightctl')

    await vi.waitFor(() => expect(wrapper.text()).toContain('CI Duty is not applicable to this project.'))
    expect(window.location.hash).toBe('#/?projectId=flightctl')
    expect(ciDutyRequests(fetchMock).at(-1)).toBe('/api/modules/system-health/ci-duty?projectId=flightctl')
    wrapper.unmount()
  })

  it('Home -> Settings -> Home keeps the project in the URL and selector', async () => {
    stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=osac')

    await sidebarNavigate(wrapper, 'settings')
    expect(window.location.hash).toBe('#/settings?projectId=osac')

    await sidebarNavigate(wrapper, 'home')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))
    expect(window.location.hash).toBe('#/?projectId=osac')
    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
    wrapper.unmount()
  })

  it('a bare #/ edit resolves the default project instead of leaving a stale selection', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=flightctl')

    fetchMock.mockClear()
    window.location.hash = '#/'
    await vi.waitFor(() => expect(window.location.hash).toBe('#/?projectId=osac'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))

    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
    expect(ciDutyRequests(fetchMock).at(-1)).toBe('/api/modules/system-health/ci-duty?projectId=osac')
    wrapper.unmount()
  })

  it('single-project OSAC deployment navigates Home without adding a projectId', async () => {
    const fetchMock = stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/releases/execute')
    expect(wrapper.find('select#project-selector').exists()).toBe(false)

    fetchMock.mockClear()
    await clickSidebar(wrapper, 'Home')

    await vi.waitFor(() => expect(ciDutyRequests(fetchMock).length).toBeGreaterThan(0))
    expect(window.location.hash).toBe('#/')
    expect(ciDutyRequests(fetchMock)).toEqual(['/api/modules/system-health/ci-duty'])
    wrapper.unmount()
  })

  it('default-project startup then module -> Home keeps the defaulted project', async () => {
    stubBackend(twoProjects)
    const wrapper = await mountApp('#/')
    await vi.waitFor(() => expect(window.location.hash).toBe('#/?projectId=osac'))

    await sidebarNavigate(wrapper, 'releases::execute')
    expect(window.location.hash).toBe('#/releases/execute?projectId=osac')
    await clickSidebar(wrapper, 'Home')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))
    expect(window.location.hash).toBe('#/?projectId=osac')
    wrapper.unmount()
  })
})
