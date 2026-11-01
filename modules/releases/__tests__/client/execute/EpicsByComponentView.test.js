import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  frozenEpicsResponse, OSAC_REGISTRY_RELEASES, OSAC_AVAILABLE_VERSIONS
} from './uiEpicsFixture'

const mockApiRequest = vi.fn()
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))
vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))

const mockProjectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId,
  projectQuery: id => (id ? `?projectId=${encodeURIComponent(id)}` : '')
}))

const mockUser = ref({})
vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ user: mockUser })
}))

import EpicsByComponentView from '../../../client/execute/views/EpicsByComponentView.vue'
import ComponentStatusFilterBar from '../../../client/execute/components/ComponentStatusFilterBar.vue'

function makeNav(initial = {}) {
  const params = ref({ ...initial })
  const updateParams = vi.fn((next) => {
    const merged = { ...params.value }
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === null) delete merged[key]
      else merged[key] = String(value)
    }
    params.value = merged
  })
  return { params, updateParams }
}

let registryResponse
let epicsResponder

function installApi() {
  mockApiRequest.mockImplementation((url) => {
    if (url.includes('/execution/versions')) return Promise.resolve({ versions: OSAC_AVAILABLE_VERSIONS })
    if (url.includes('/registry')) return registryResponse()
    if (url.includes('/execution/epics')) return epicsResponder(new URL(url, 'http://x').searchParams.get('version'))
    return Promise.reject(new Error('unexpected url ' + url))
  })
}

async function mountView(navParams = {}) {
  const nav = makeNav(navParams)
  const wrapper = mount(EpicsByComponentView, { global: { provide: { moduleNav: nav } } })
  await flushPromises()
  return { wrapper, nav }
}

const releaseSelect = wrapper => wrapper.find('#epics-by-component-release')
const panelNames = wrapper => wrapper.findAll('[data-panel]').map(p => p.attributes('data-panel'))
const urlsCalled = fragment => mockApiRequest.mock.calls.map(([url]) => url).filter(url => url.includes(fragment))

describe('EpicsByComponentView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 1, 12))
    mockApiRequest.mockReset()
    mockProjectId.value = ''
    mockUser.value = {}
    registryResponse = () => Promise.resolve({ releases: OSAC_REGISTRY_RELEASES })
    epicsResponder = version => Promise.resolve(
      version === '0.4' ? frozenEpicsResponse() : { version, fetchedAt: null, featureCount: 0, features: [], state: 'empty' }
    )
    installApi()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('selects the next-GA release by default and records it in the URL', async () => {
    const { wrapper, nav } = await mountView()

    expect(releaseSelect(wrapper).element.value).toBe('0.5')
    expect(nav.updateParams).toHaveBeenCalledWith({ release: '0.5' }, { push: false })
    expect(urlsCalled('/execution/epics')[0]).toContain('version=0.5')
    expect(wrapper.text()).toContain('OSAC 0.5 · GA Nov 30 · Next GA')
    wrapper.unmount()
  })

  it('reads the registry for the OSAC project when the shell project id is empty', async () => {
    const { wrapper } = await mountView()
    expect(urlsCalled('/registry')).toEqual(['/modules/releases/registry?projectId=osac'])
    expect(urlsCalled('/execution/versions')[0]).not.toContain('projectId')
    wrapper.unmount()
  })

  it('uses the shell project id for the registry when one is set', async () => {
    mockProjectId.value = 'osac'
    const { wrapper } = await mountView()
    expect(urlsCalled('/registry')).toEqual(['/modules/releases/registry?projectId=osac'])
    expect(urlsCalled('/execution/versions')[0]).toContain('projectId=osac')
    wrapper.unmount()
  })

  it('restores ?release= from the URL and renders the panels with summary counts', async () => {
    const { wrapper } = await mountView({ release: '0.4' })

    expect(releaseSelect(wrapper).element.value).toBe('0.4')
    expect(panelNames(wrapper)).toEqual([
      'Enclave', 'CaaS', 'BMaaS', 'VMaaS', 'Core', 'Connectivity&Fabric', 'Metering, Billing and Quota', 'Storage', 'Observability'
    ])
    expect(wrapper.find('[data-testid="summary-counts"]').text()).toBe('26 Epics · 28 rows')
    expect(wrapper.find('[data-testid="fetched-at"]').text()).toContain('Data as of')
    expect(wrapper.text()).toContain('Bootstrap Epics only')
    wrapper.unmount()
  })

  it('falls back to the default with a notice when ?release= is not available', async () => {
    const { wrapper } = await mountView({ release: '9.9' })

    expect(releaseSelect(wrapper).element.value).toBe('0.5')
    expect(wrapper.text()).toContain('Release 9.9 is not available for this project')
    wrapper.unmount()
  })

  it('keeps a user-selected release in the URL and loads its Epics', async () => {
    const { wrapper, nav } = await mountView()
    await releaseSelect(wrapper).setValue('0.4')
    await flushPromises()

    expect(nav.updateParams).toHaveBeenLastCalledWith({ release: '0.4' }, { push: false })
    expect(wrapper.find('[data-testid="summary-counts"]').text()).toBe('26 Epics · 28 rows')
    wrapper.unmount()
  })

  it('shows a select prompt and requests no Epics when the registry is unavailable', async () => {
    registryResponse = () => Promise.reject(new Error('boom'))
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Select a release to view')
    expect(wrapper.text()).toContain('release schedule could not be loaded')
    expect(releaseSelect(wrapper).element.value).toBe('')
    expect(urlsCalled('/execution/epics')).toHaveLength(0)
    wrapper.unmount()
  })

  it('does not guess a release when no registry release maps to an available version', async () => {
    registryResponse = () => Promise.resolve({ releases: [{ ...OSAC_REGISTRY_RELEASES[0], fixVersions: ['nope'] }] })
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Select a release to view')
    expect(urlsCalled('/execution/epics')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows a skeleton while Epics load', async () => {
    let resolveEpics
    epicsResponder = () => new Promise(resolve => { resolveEpics = resolve })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="loading-skeleton"]').exists()).toBe(true)
    resolveEpics({ features: [], state: 'empty' })
    await flushPromises()
    expect(wrapper.find('[data-testid="loading-skeleton"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows muted empty panels and one line when a release has no matching Epics', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="no-epics-note"]').text()).toBe('No matching Epics for release 0.5.')
    expect(panelNames(wrapper)).toHaveLength(9)
    expect(wrapper.find('[data-testid="summary-counts"]').text()).toBe('0 Epics · 0 rows')
    wrapper.unmount()
  })

  it('surfaces partial data and unavailable hierarchies', async () => {
    epicsResponder = () => Promise.resolve({ ...frozenEpicsResponse(), state: 'partial', message: 'Some Features failed to load.' })
    const partial = await mountView({ release: '0.4' })
    expect(partial.wrapper.text()).toContain('Some Features failed to load.')
    partial.wrapper.unmount()

    epicsResponder = () => Promise.resolve({ features: [], state: 'unavailable', message: 'Hierarchy not collected.' })
    const unavailable = await mountView({ release: '0.4' })
    expect(unavailable.wrapper.text()).toContain('Hierarchy not collected.')
    expect(panelNames(unavailable.wrapper)).toHaveLength(0)
    unavailable.wrapper.unmount()
  })

  it('surfaces a load error', async () => {
    epicsResponder = () => Promise.reject(new Error('Server error'))
    const { wrapper } = await mountView({ release: '0.4' })
    expect(wrapper.text()).toContain('Server error')
    wrapper.unmount()
  })

  it('narrows rows with filters and resets them when the release changes', async () => {
    const { wrapper } = await mountView({ release: '0.4' })
    const bar = () => wrapper.findComponent(ComponentStatusFilterBar)

    bar().vm.$emit('toggle-status', 'In Progress')
    await nextTick()
    expect(wrapper.find('[data-testid="summary-counts"]').text()).toBe('1 Epic · 1 row')

    bar().vm.$emit('clear')
    bar().vm.$emit('toggle-label', 'ux-complete')
    await nextTick()
    expect(wrapper.find('[data-testid="summary-counts"]').text()).toBe('1 Epic · 2 rows')

    bar().vm.$emit('toggle-component', 'Core')
    await nextTick()
    expect(panelNames(wrapper)).toEqual(['Core'])

    await releaseSelect(wrapper).setValue('0.5')
    await flushPromises()
    expect(bar().exists()).toBe(true)
    expect(bar().props('selectedLabels')).toEqual([])
    expect(bar().props('selectedComponents')).toEqual([])
    wrapper.unmount()
  })

  it('keeps a manually collapsed panel across filter changes and re-expands it when the release changes', async () => {
    const { wrapper } = await mountView({ release: '0.4' })
    const coreToggle = () => wrapper.find('[data-panel="Core"] h3 button')
    await coreToggle().trigger('click')
    expect(coreToggle().attributes('aria-expanded')).toBe('false')

    wrapper.findComponent(ComponentStatusFilterBar).vm.$emit('toggle-status', 'Closed')
    await nextTick()
    wrapper.findComponent(ComponentStatusFilterBar).vm.$emit('clear')
    await nextTick()
    expect(coreToggle().attributes('aria-expanded')).toBe('false')

    await releaseSelect(wrapper).setValue('0.5')
    await flushPromises()
    await releaseSelect(wrapper).setValue('0.4')
    await flushPromises()
    expect(coreToggle().attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('offers Assigned to me only when the user has a Jira display name', async () => {
    const without = await mountView({ release: '0.4' })
    expect(without.wrapper.findComponent(ComponentStatusFilterBar).props('meAssignee')).toBeNull()
    without.wrapper.unmount()

    mockUser.value = { jiraDisplayName: 'Ilya Skornyakov' }
    const withName = await mountView({ release: '0.4' })
    const bar = withName.wrapper.findComponent(ComponentStatusFilterBar)
    expect(bar.props('meAssignee')).toBe('Ilya Skornyakov')
    bar.vm.$emit('set-assignee-me')
    await nextTick()
    expect(withName.wrapper.find('[data-testid="summary-counts"]').text()).toBe('1 Epic · 2 rows')
    withName.wrapper.unmount()
  })

  it('discards the selection and re-applies the default on project change', async () => {
    const { wrapper, nav } = await mountView()
    await releaseSelect(wrapper).setValue('0.4')
    await flushPromises()

    nav.params.value = { ...nav.params.value, release: '0.4' }
    mockProjectId.value = 'osac'
    await flushPromises()

    expect(nav.updateParams).toHaveBeenCalledWith({ release: undefined }, { push: false })
    expect(releaseSelect(wrapper).element.value).toBe('0.5')
    wrapper.unmount()
  })

  it('renders an unavailable message and loads nothing for an unconfigured project', async () => {
    mockProjectId.value = 'flightctl'
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('not available for this project')
    expect(mockApiRequest).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('removes the release param when the view unmounts', async () => {
    const { wrapper, nav } = await mountView()
    nav.updateParams.mockClear()
    wrapper.unmount()
    expect(nav.updateParams).toHaveBeenCalledWith({ release: undefined }, { push: false })
  })
})
