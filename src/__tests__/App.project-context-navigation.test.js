/**
 * Drives the real App shell (sidebar, project selector, hash routing,
 * useProjectId) with the real CiDutyWidget as the Home view, so a lost
 * projectId shows up as a CI Duty request without it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    }, {
      slug: 'team-tracker',
      name: 'People & Teams',
      client: { navItems: [{ id: 'overview', label: 'Overview', default: true }] }
    }, {
      slug: 'test-coverage',
      name: 'Test Coverage',
      client: { projectIds: ['osac'], navItems: [{ id: 'coverage', label: 'Coverage', default: true }] }
    }],
    loadModuleClient: async () => ({
      routes: Object.fromEntries(['execute', 'overview', 'people', 'reports', 'team-detail', 'person-detail', 'coverage']
        .map(viewId => [viewId, StubView]))
    })
  }
})

vi.mock('../components/LandingPage.vue', async () => ({
  default: (await import('../../modules/system-health/client/widgets/CiDutyWidget.vue')).default
}))

import App from '../components/App.vue'
import { useGithubStats } from '@shared/client/composables/useGithubStats'
import { useGitlabStats } from '@shared/client/composables/useGitlabStats'

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

// deferProjects: { promise } makes project discovery wait for the test.
function stubBackend(projects, { deferProjects } = {}) {
  const fetchMock = vi.fn(async (url) => {
    if (url.includes('/modules/system-health/ci-duty')) return ciDutyResponse(url)
    if (url.endsWith('/whoami')) return jsonResponse({ email: 'dev@example.com', isAdmin: false })
    if (url.endsWith('/projects')) {
      if (deferProjects) await deferProjects.promise
      return projects instanceof Error ? jsonResponse({ error: 'down' }, 500) : jsonResponse({ projects })
    }
    if (url.includes('/api/roster')) {
      const projectId = new URL(url, 'http://localhost').searchParams.get('projectId')
      return jsonResponse(projectId ? { projectId, teams: [], people: [] } : { orgs: {}, people: [] })
    }
    if (url.endsWith('/built-in-modules/state')) {
      return jsonResponse({ enabledSlugs: ['releases', 'system-health', 'team-tracker', 'test-coverage'] })
    }
    if (url.endsWith('/built-in-modules/manifests')) return jsonResponse({ modules: [] })
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function ciDutyRequests(fetchMock) {
  return fetchMock.mock.calls.map(([url]) => url).filter(url => url.includes('/ci-duty'))
}

// People & Teams requests that carry no project: legacy roster, permissions,
// messages and org-scoped contribution stats.
function unqualifiedProjectRequests(fetchMock) {
  return fetchMock.mock.calls.map(([url]) => url).filter(url =>
    /\/api\/roster|\/permissions\/me|\/api\/messages|\/(github|gitlab)\/contributions/.test(url)
    && !url.includes('projectId='))
}

function contributionRequests(fetchMock) {
  return fetchMock.mock.calls.map(([url]) => url).filter(url => /\/(github|gitlab)\/contributions/.test(url))
}

async function mountApp(initialHash) {
  window.location.hash = initialHash
  // A real page load initializes useProjectId from the URL; hashchange alone arrives too late here.
  window.dispatchEvent(new Event('urlchange'))
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

  it.each([
    [twoProjects, '#/help?projectId=osac', '#/about?projectId=osac&tab=help'],
    [twoProjects, '#/docs', '#/about?projectId=osac&tab=docs'],
    [[twoProjects[0]], '#/docs', '#/about?projectId=osac&tab=docs']
  ])('shell redirects keep the URL project and add the default when the URL has none (%#)', async (projects, from, expected) => {
    stubBackend(projects)
    const wrapper = await mountApp(from)
    await vi.waitFor(() => expect(window.location.hash).toBe(expected))
    wrapper.unmount()
  })

  it('single-project OSAC deployment qualifies the URL and keeps projectId=osac through Home', async () => {
    const fetchMock = stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/releases/execute')
    expect(wrapper.find('select#project-selector').exists()).toBe(false)
    expect(window.location.hash).toBe('#/releases/execute?projectId=osac')

    fetchMock.mockClear()
    await clickSidebar(wrapper, 'Home')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Osac Lead'))
    expect(window.location.hash).toBe('#/?projectId=osac')
    expect(ciDutyRequests(fetchMock)).toEqual(['/api/modules/system-health/ci-duty?projectId=osac'])
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

describe('shell initial data and the project context', () => {
  beforeEach(async () => {
    // The contribution caches are module-level; empty them so each test sees its own requests.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 404)))
    window.location.hash = ''
    window.dispatchEvent(new Event('urlchange'))
    await Promise.all([useGithubStats().reloadGithubStats(), useGitlabStats().reloadGitlabStats()])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it.each(['osac', 'flightctl'])('a %s deep link loads the project roster and no legacy contribution stats', async (projectId) => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp(`#/team-tracker/people?projectId=${projectId}`)

    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain(`/api/roster?projectId=${projectId}`)
    expect(urls).not.toContain('/api/roster')
    expect(contributionRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it.each([
    ['#/people', '#/team-tracker/people?projectId=osac'],
    ['#/trends', '#/team-tracker/reports?projectId=osac&report=trends'],
    ['#/team/org%3A%3AFoo', '#/team-tracker/team-detail?projectId=osac&teamKey=org%3A%3AFoo']
  ])('the legacy bookmark %s lands on the default project without an unqualified roster request', async (bookmark, expectedHash) => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp(bookmark)

    try {
      await vi.waitFor(() => expect(window.location.hash).toBe(expectedHash))
      expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/roster')
      expect(contributionRequests(fetchMock)).toEqual([])
    } finally {
      wrapper.unmount()
    }
  })

  it('an unknown project shows not-found and issues no unqualified roster or contribution requests', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/team-tracker/people?projectId=nope')

    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).not.toContain('/api/roster')
    expect(contributionRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it('switching project keeps contribution stats unrequested', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/team-tracker/people?projectId=osac')

    await wrapper.find('select#project-selector').setValue('flightctl')
    await flushPromises()

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/roster?projectId=flightctl')
    expect(contributionRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it('a single-project OSAC deep link without a project loads the canonical roster and no legacy requests', async () => {
    const fetchMock = stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/team-tracker/people')

    await vi.waitFor(() => expect(window.location.hash).toBe('#/team-tracker/people?projectId=osac'))
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/roster?projectId=osac')
    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it('a single-project OSAC URL edited to drop the project resolves back to osac without legacy requests', async () => {
    const fetchMock = stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/team-tracker/people?projectId=osac')
    fetchMock.mockClear()

    window.location.hash = '#/team-tracker/people'
    await vi.waitFor(() => expect(window.location.hash).toBe('#/team-tracker/people?projectId=osac'))
    await flushPromises()
    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it('a multi-project bare URL edit resolves the default project without loading contribution stats', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/team-tracker/people?projectId=flightctl')

    window.location.hash = '#/team-tracker/people'
    await vi.waitFor(() => expect(window.location.hash).toBe('#/team-tracker/people?projectId=osac'))
    await flushPromises()
    expect(contributionRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })
})

describe('shell project resolution during initialization and transitions', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.location.hash = ''
    window.dispatchEvent(new Event('urlchange'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('issues no People & Teams request and renders no module while the project list is loading', async () => {
    let release
    const deferProjects = { promise: new Promise(resolve => { release = resolve }) }
    const fetchMock = stubBackend(twoProjects, { deferProjects })
    const wrapper = await mountApp('#/team-tracker/people')

    expect(wrapper.text()).toContain('Loading project context')
    expect(wrapper.findComponent({ name: 'StubView' }).exists()).toBe(false)
    expect(fetchMock.mock.calls.map(([url]) => url).filter(url => /roster|permissions|messages|ci-duty/.test(url))).toEqual([])

    release()
    await vi.waitFor(() => expect(window.location.hash).toBe('#/team-tracker/people?projectId=osac'))
    await flushPromises()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/roster?projectId=osac')
    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it('shows the unavailable state, not a legacy view, when project discovery fails', async () => {
    const fetchMock = stubBackend(new Error('down'))
    const wrapper = await mountApp('#/team-tracker/people')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Project context unavailable'))

    expect(wrapper.findComponent({ name: 'StubView' }).exists()).toBe(false)
    expect(fetchMock.mock.calls.map(([url]) => url).filter(url => /roster|permissions|messages/.test(url))).toEqual([])
    wrapper.unmount()
  })

  it('a project-less link opened while another project is selected resolves to the default without a legacy request', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/team-tracker/people?projectId=flightctl')
    fetchMock.mockClear()

    window.location.hash = '#/team-tracker/people'
    await vi.waitFor(() => expect(window.location.hash).toBe('#/team-tracker/people?projectId=osac'))
    await flushPromises()

    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/roster?projectId=osac')
    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
    wrapper.unmount()
  })

  it('project switching requests only the new project and never an unqualified fallback', async () => {
    const fetchMock = stubBackend(twoProjects)
    const wrapper = await mountApp('#/team-tracker/people?projectId=osac')
    fetchMock.mockClear()

    await wrapper.find('select#project-selector').setValue('flightctl')
    await flushPromises()
    await wrapper.find('select#project-selector').setValue('osac')
    await flushPromises()

    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/roster?projectId=flightctl')
    expect(urls).toContain('/api/modules/team-tracker/permissions/me?projectId=flightctl')
    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })

  it.each(['osac', 'flightctl'])('legacy in-module bookmarks keep the %s project', async (projectId) => {
    stubBackend(twoProjects)
    const cases = [
      ['#/team-tracker/team/org%3A%3AFoo', { teamKey: 'org::Foo' }, 'team-detail'],
      ['#/team-tracker/team/org%3A%3AFoo/person/jdoe', { teamKey: 'org::Foo', person: 'jdoe' }, 'person-detail'],
      ['#/team-tracker/trends', { report: 'trends' }, 'reports'],
      ['#/team-tracker/org-allocation', { report: 'allocation' }, 'reports'],
      ['#/team-tracker/dashboard', {}, 'home'],
      ['#/team-tracker/team-roster?teamKey=org%3A%3AFoo', { teamKey: 'org::Foo' }, 'team-detail'],
      ['#/org-roster/org-explorer', {}, 'org-dashboard']
    ]
    for (const [bookmark, expectedParams, view] of cases) {
      const wrapper = await mountApp(`${bookmark}${bookmark.includes('?') ? '&' : '?'}projectId=${projectId}`)
      await vi.waitFor(() => expect(window.location.hash).toContain(`/team-tracker/${view}?`))
      const url = new URL(window.location.hash.slice(1), 'http://localhost')
      expect(url.searchParams.get('projectId')).toBe(projectId)
      for (const [key, value] of Object.entries(expectedParams)) {
        expect(url.searchParams.get(key)).toBe(value)
      }
      wrapper.unmount()
    }
  })

  it('a legacy in-module bookmark without a project lands on the default project', async () => {
    const fetchMock = stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/team-tracker/team/org%3A%3AFoo/person/jdoe')

    await vi.waitFor(() => expect(window.location.hash)
      .toBe('#/team-tracker/person-detail?projectId=osac&teamKey=org%3A%3AFoo&person=jdoe'))
    await flushPromises()
    expect(unqualifiedProjectRequests(fetchMock)).toEqual([])
    wrapper.unmount()
  })
})

describe('cross-module routing with a resolved project', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.location.hash = ''
    window.dispatchEvent(new Event('urlchange'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it.each([
    ['a single OSAC project', [twoProjects[0]]],
    ['OSAC and Flight Control', twoProjects]
  ])('an OSAC-only module opens for %s and carries projectId=osac', async (_name, projects) => {
    stubBackend(projects)
    const wrapper = await mountApp('#/test-coverage/coverage')

    await vi.waitFor(() => expect(window.location.hash).toBe('#/test-coverage/coverage?projectId=osac'))
    expect(wrapper.vm.activeModule).toBe('test-coverage')
    wrapper.unmount()
  })

  it('an OSAC-only module falls back to Home inside Flight Control', async () => {
    stubBackend(twoProjects)
    const wrapper = await mountApp('#/test-coverage/coverage?projectId=flightctl')

    await vi.waitFor(() => expect(window.location.hash).toBe('#/?projectId=flightctl'))
    expect(wrapper.vm.activeModule).toBe('home')
    wrapper.unmount()
  })

  it('a project-less OSAC-only link opened inside Flight Control resolves against the default, not the previous project', async () => {
    stubBackend(twoProjects)
    const wrapper = await mountApp('#/releases/execute?projectId=flightctl')

    window.location.hash = '#/test-coverage/coverage'
    await vi.waitFor(() => expect(window.location.hash).toBe('#/test-coverage/coverage?projectId=osac'))
    expect(wrapper.vm.activeModule).toBe('test-coverage')
    wrapper.unmount()
  })

  it.each([
    ['releases::execute', '#/releases/execute?projectId=osac'],
    ['team-tracker::overview', '#/team-tracker/overview?projectId=osac'],
    ['test-coverage::coverage', '#/test-coverage/coverage?projectId=osac']
  ])('sidebar navigation to %s keeps projectId=osac in a single-project deployment', async (target, expected) => {
    stubBackend([twoProjects[0]])
    const wrapper = await mountApp('#/')
    await vi.waitFor(() => expect(window.location.hash).toBe('#/?projectId=osac'))

    await sidebarNavigate(wrapper, target)
    expect(window.location.hash).toBe(expected)
    wrapper.unmount()
  })
})
