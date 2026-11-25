import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

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

import UiUxByComponentView from '../../../client/execute/views/UiUxByComponentView.vue'
import ComponentStatusFilterBar from '../../../client/execute/components/ComponentStatusFilterBar.vue'

function isoDay(offsetDays) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const REGISTRY_RELEASES = [
  { id: 'fx-0.4', fixVersions: ['0.4'], state: 'active', milestones: { ga: isoDay(-30) } },
  { id: 'fx-0.5', fixVersions: ['0.5'], state: 'active', milestones: { ga: isoDay(30) } }
]

function source(epicKey, overrides = {}) {
  return {
    epicKey, epicType: 'uix', fixVersions: [], components: [], localStatus: 'in-progress',
    stageLabels: [], routingLabels: [], status: 'In Progress', assignee: 'Epic Owner',
    priority: 'Normal', resolution: null, ...overrides
  }
}

function feature(key, { sources = [source(`${key}-E`)], uiStatus = 'in-progress', uxStatus = 'in-progress', ...overrides } = {}) {
  const evidence = status => ({ status, conflict: false, scopes: [], sources })
  return {
    key, summary: `${key} summary`, status: 'In Progress', resolution: null, priority: 'Major',
    assignee: 'Feature Owner', fixVersions: ['0.5'], components: ['Core'], labels: [],
    uiEvidence: evidence(uiStatus), uxEvidence: evidence(uxStatus), ...overrides
  }
}

let featuresResponse

function installApi() {
  mockApiRequest.mockImplementation((url) => {
    if (url.includes('/registry')) return Promise.resolve({ releases: REGISTRY_RELEASES })
    if (url.includes('/execution/features')) return Promise.resolve(featuresResponse())
    return Promise.reject(new Error('unexpected url ' + url))
  })
}

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
  return { params, updateParams, navigateTo: vi.fn() }
}

async function mountView(navParams = {}) {
  const nav = makeNav(navParams)
  const wrapper = mount(UiUxByComponentView, { global: { provide: { moduleNav: nav } } })
  await flushPromises()
  return { wrapper, nav }
}

const panel = (wrapper, name) => wrapper.get(`[data-panel="${name}"]`)
const cardKeys = (wrapper, name) => panel(wrapper, name).findAll('[data-testid="feature-card"]')
  .map(card => card.get('a').text())

beforeEach(() => {
  mockProjectId.value = ''
  mockUser.value = {}
  mockApiRequest.mockReset()
  featuresResponse = () => ({
    state: 'supported', fetchedAt: '2026-11-25T10:00:00Z',
    features: [
      feature('OSAC-1', { components: ['Storage'], labels: ['customer:telus'] }),
      feature('OSAC-2', { components: ['Core'], fixVersions: ['0.4'] }),
      feature('OSAC-3', { components: [], fixVersions: [] })
    ]
  })
  installApi()
})

afterEach(() => vi.clearAllMocks())

describe('UiUxByComponentView', () => {
  it('defaults to the next GA release and renders Feature cards in their panels, including Other', async () => {
    const { wrapper, nav } = await mountView()
    expect(wrapper.get('h1').text()).toBe('UI/UX by Component')
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.5')
    expect(wrapper.findAll('#ui-ux-board-release option').map(o => o.text())).toEqual(['0.4', '0.5', 'Unscheduled'])
    expect(wrapper.findAll('[data-panel]')).toHaveLength(10)
    expect(cardKeys(wrapper, 'Storage')).toEqual(['OSAC-1'])
    expect(cardKeys(wrapper, 'Core')).toEqual([])
    expect(cardKeys(wrapper, 'Other')).toEqual([])
    expect(wrapper.get('[data-testid="summary-counts"]').text()).toBe('1 Feature · 1 row')
    expect(nav.updateParams).toHaveBeenCalledWith({ release: '0.5' }, { push: false })
  })

  it('opens Unscheduled and Other from the release selector', async () => {
    const { wrapper } = await mountView({ release: 'Unscheduled' })
    expect(cardKeys(wrapper, 'Other')).toEqual(['OSAC-3'])
    expect(panel(wrapper, 'Other').get('[data-testid="other-reason"]').text()).toContain('no component')
  })

  it('falls back to the default with a notice for an unavailable URL release', async () => {
    const { wrapper } = await mountView({ release: '9.9' })
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.5')
    expect(wrapper.text()).toContain('Release 9.9 is not available')
  })

  it('resolves the URL release under the board normalization and rewrites it to the canonical option', async () => {
    const { wrapper, nav } = await mountView({ release: '0.4.Z' })
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.4')
    expect(wrapper.text()).not.toContain('is not available')
    expect(nav.updateParams).toHaveBeenCalledWith({ release: '0.4' }, { push: false })
  })

  it('opens Unscheduled from a differently cased URL release', async () => {
    const { wrapper } = await mountView({ release: 'unscheduled' })
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('Unscheduled')
  })

  it('picks the registry default when the registry version is a z-stream spelling of an option', async () => {
    REGISTRY_RELEASES[1].fixVersions = ['0.5.z']
    try {
      const { wrapper } = await mountView()
      expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.5')
    } finally {
      REGISTRY_RELEASES[1].fixVersions = ['0.5']
    }
  })

  it('offers and opens a release whose Features are all excluded, listing them under Not shown', async () => {
    featuresResponse = () => ({
      state: 'supported',
      features: [
        feature('OSAC-1'),
        feature('OSAC-2', { fixVersions: ['0.3'], resolution: "Won't Do", status: 'Closed' }),
        feature('OSAC-4', { fixVersions: ['0.3'], uiStatus: 'not-applicable' })
      ]
    })
    const { wrapper } = await mountView({ release: '0.3' })
    expect(wrapper.findAll('#ui-ux-board-release option').map(o => o.text())).toContain('0.3')
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.3')
    const entries = wrapper.findAll('[data-testid="not-shown-entry"]')
    expect(entries.map(e => e.get('a').text())).toEqual(['OSAC-2', 'OSAC-4'])
    expect(entries[1].text()).toContain('no-ui')
  })

  it('defaults to a selectable release when no release has visible cards', async () => {
    featuresResponse = () => ({
      state: 'supported',
      features: [
        feature('OSAC-2', { fixVersions: ['0.5'], resolution: "Won't Do", status: 'Closed' }),
        feature('OSAC-4', { fixVersions: ['0.4'], uiStatus: 'not-applicable' })
      ]
    })
    const { wrapper } = await mountView()
    expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.5')
    expect(wrapper.findAll('[data-testid="not-shown-entry"]').map(e => e.get('a').text())).toEqual(['OSAC-2'])
  })

  it('tolerates registry releases with malformed Fix Versions', async () => {
    REGISTRY_RELEASES.push({ id: 'fx-bad', fixVersions: '0.9', state: 'active', milestones: { ga: isoDay(5) } })
    try {
      const { wrapper } = await mountView()
      expect(wrapper.get('#ui-ux-board-release').element.value).toBe('0.5')
    } finally {
      REGISTRY_RELEASES.pop()
    }
  })

  it('does not rewrite the route when it unmounts', async () => {
    const { wrapper, nav } = await mountView({ release: '0.5' })
    nav.updateParams.mockClear()
    wrapper.unmount()
    expect(nav.updateParams).not.toHaveBeenCalled()
  })

  it('does not render a project without a dashboard config', async () => {
    mockProjectId.value = 'flightctl'
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('UI/UX by Component is not available for this project.')
    expect(mockApiRequest).not.toHaveBeenCalled()
  })

  it('filters by Feature label without release scoping', async () => {
    const { wrapper } = await mountView()
    const bar = wrapper.getComponent(ComponentStatusFilterBar)
    expect(bar.props('labelOptions')).toEqual(['customer:telus'])
    bar.vm.$emit('toggle-label', 'customer:telus')
    await flushPromises()
    expect(cardKeys(wrapper, 'Storage')).toEqual(['OSAC-1'])
    bar.vm.$emit('toggle-label', 'customer:telus')
    bar.vm.$emit('toggle-label', 'customer:other')
    await flushPromises()
    expect(wrapper.find('[data-testid="no-features-note"]').text()).toBe('No Features match the current filters.')
  })

  it('offers Priority and matches Epic assignees with provenance', async () => {
    featuresResponse = () => ({
      state: 'supported',
      features: [feature('OSAC-1', { assignee: 'Linus', sources: [source('OSAC-9', { assignee: 'Ada' })] })]
    })
    const { wrapper } = await mountView()
    const bar = wrapper.getComponent(ComponentStatusFilterBar)
    expect(bar.props('priorityOptions')).toEqual(['Major', 'Normal'])
    bar.vm.$emit('toggle-assignee', 'Ada')
    await flushPromises()
    expect(wrapper.get('[data-testid="matched-via"]').text()).toBe('Matched via OSAC-9')
    expect(wrapper.get('[data-testid="source-row"]').attributes('data-matched')).toBe('true')

    await wrapper.get('#ui-ux-board-match-on').setValue('feature')
    expect(wrapper.find('[data-testid="feature-card"]').exists()).toBe(false)
  })

  it('disables Epic matching with a visible note when sources lack Epic fields', async () => {
    const legacySource = source('OSAC-9')
    for (const field of ['status', 'assignee', 'priority', 'resolution']) delete legacySource[field]
    featuresResponse = () => ({ state: 'supported', features: [feature('OSAC-1', { sources: [legacySource] })] })
    const { wrapper } = await mountView()
    expect(wrapper.get('#ui-ux-board-match-on').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="epic-fields-note"]').text()).toContain('match the Feature only')
    expect(cardKeys(wrapper, 'Core')).toEqual(['OSAC-1'])
  })

  it('lists excluded Features under Not shown with their Jira links', async () => {
    featuresResponse = () => ({
      state: 'supported',
      features: [
        feature('OSAC-1'),
        feature('OSAC-2', { resolution: "Won't Do", status: 'Closed' }),
        feature('OSAC-3', { sources: [source('OSAC-30', { resolution: 'Obsolete' })] })
      ]
    })
    const { wrapper } = await mountView()
    const notShown = wrapper.get('[data-testid="not-shown"]')
    expect(notShown.get('summary').text()).toBe('Not shown (2)')
    const entries = notShown.findAll('[data-testid="not-shown-entry"]')
    expect(entries.map(e => e.get('a').attributes('href'))).toEqual([
      'https://redhat.atlassian.net/browse/OSAC-2', 'https://redhat.atlassian.net/browse/OSAC-3'
    ])
    expect(entries[0].text()).toContain("Resolution: Won't Do")
    expect(entries[1].text()).toContain('no-work resolution')
  })

  it('uses the project terminal-outcome profile for non-delivery when the response carries one', async () => {
    featuresResponse = () => ({
      state: 'supported',
      terminalOutcomeProfile: { completed: ['Done'], nonDelivery: ['Rejected'] },
      features: [feature('OSAC-1', { resolution: 'Rejected' }), feature('OSAC-2', { resolution: 'Declined' })]
    })
    const { wrapper } = await mountView()
    expect(cardKeys(wrapper, 'Core')).toEqual(['OSAC-2'])
  })

  it('links Features to Jira without any in-app Feature Detail navigation', async () => {
    const { wrapper, nav } = await mountView()
    expect(panel(wrapper, 'Storage').get('a').attributes('href')).toBe('https://redhat.atlassian.net/browse/OSAC-1')
    expect(wrapper.find('[data-testid="open-feature"]').exists()).toBe(false)
    expect(nav.navigateTo).not.toHaveBeenCalled()
  })

  it('shows the release prompt rather than an empty board when the inventory is unavailable', async () => {
    featuresResponse = () => ({ state: 'unavailable', message: 'Inventory is down', features: [] })
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('Select a release')
  })
})

describe('UiUxByComponentView Epic disclosure, search and status filters', () => {
  const MULTI = () => ({
    state: 'supported',
    features: [
      feature('OSAC-1', { assignee: 'Linus', summary: 'Provisioning wizard', sources: [source('EPIC-9', { assignee: 'Ada' }), source('EPIC-10')] }),
      feature('OSAC-2', { assignee: 'Grace', fixVersions: ['0.4', '0.5'], summary: 'Storage tiers', uxStatus: 'design', uiStatus: 'not-started', sources: [source('EPIC-20')] })
    ]
  })

  const cardFor = (wrapper, key) => wrapper.findAll('[data-testid="feature-card"]').find(card => card.get('a').text() === key)
  const epicsOpen = (wrapper, key) => cardFor(wrapper, key).get('[data-testid="epics-toggle"]').attributes('aria-expanded') === 'true'
  const search = (wrapper, text) => wrapper.get('#ui-ux-board-search').setValue(text)

  beforeEach(() => { featuresResponse = MULTI })

  it('collapses every Epic table by default and toggles one Feature at a time', async () => {
    const { wrapper } = await mountView()
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)
    expect(epicsOpen(wrapper, 'OSAC-2')).toBe(false)
    await cardFor(wrapper, 'OSAC-1').get('[data-testid="epics-toggle"]').trigger('click')
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(true)
    expect(epicsOpen(wrapper, 'OSAC-2')).toBe(false)
  })

  it('expands and collapses all, with a manual toggle overriding the bulk choice', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="expand-all"]').trigger('click')
    expect(epicsOpen(wrapper, 'OSAC-1') && epicsOpen(wrapper, 'OSAC-2')).toBe(true)
    await cardFor(wrapper, 'OSAC-2').get('[data-testid="epics-toggle"]').trigger('click')
    expect(epicsOpen(wrapper, 'OSAC-2')).toBe(false)
    await wrapper.get('[data-testid="collapse-all"]').trigger('click')
    expect(epicsOpen(wrapper, 'OSAC-1') || epicsOpen(wrapper, 'OSAC-2')).toBe(false)
  })

  it('reveals and highlights Epic rows matched by an Epic-level filter, not Feature-only matches', async () => {
    const { wrapper } = await mountView()
    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('toggle-assignee', 'Ada')
    await flushPromises()
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(true)
    const rows = cardFor(wrapper, 'OSAC-1').findAll('[data-testid="source-row"]')
    expect(rows.map(r => r.attributes('data-matched'))).toEqual(['true', undefined])
    expect(cardFor(wrapper, 'OSAC-1').get('[data-testid="epics-match-count"]').text()).toContain('1 match')

    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('toggle-assignee', 'Ada')
    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('toggle-assignee', 'Linus')
    await flushPromises()
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)
  })

  it('resets manual and bulk expansion when a filter, the search or the release changes', async () => {
    const { wrapper } = await mountView()
    await wrapper.get('[data-testid="expand-all"]').trigger('click')
    await search(wrapper, 'wizard')
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)

    await cardFor(wrapper, 'OSAC-1').get('[data-testid="epics-toggle"]').trigger('click')
    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('toggle-priority', 'Major')
    await flushPromises()
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)

    await wrapper.get('[data-testid="expand-all"]').trigger('click')
    await wrapper.get('#ui-ux-board-release').setValue('0.4')
    await wrapper.get('#ui-ux-board-release').setValue('0.5')
    await flushPromises()
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)
  })

  it('searches by Feature key, summary and Epic key within the release', async () => {
    const { wrapper } = await mountView()
    const listed = () => wrapper.findAll('[data-testid="feature-card"]').map(card => card.get('a').text())
    await search(wrapper, 'osac-2')
    expect(listed()).toEqual(['OSAC-2'])
    await search(wrapper, 'wizard')
    expect(listed()).toEqual(['OSAC-1'])
    await search(wrapper, 'nothing here')
    expect(wrapper.get('[data-testid="no-features-note"]').text()).toBe('No Features match the current filters.')
  })

  it('reveals only the Epic row whose key matched the search', async () => {
    const { wrapper } = await mountView()
    await search(wrapper, 'EPIC-10')
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(true)
    expect(cardFor(wrapper, 'OSAC-1').findAll('[data-testid="source-row"]').map(r => r.attributes('data-matched'))).toEqual([undefined, 'true'])
    await search(wrapper, 'wizard')
    expect(epicsOpen(wrapper, 'OSAC-1')).toBe(false)
  })

  it('filters on Feature-level UX and UI status and clears them from the toolbar', async () => {
    const { wrapper } = await mountView()
    const filters = wrapper.findAllComponents({ name: 'UiUxStatusFilter' })
    expect(filters.map(f => f.props('label'))).toEqual(['UX status', 'UI status'])
    expect(filters[0].props('options')).toEqual(['design', 'in-progress'])
    for (const filter of filters) expect(filter.attributes('title')).toContain('Feature-wide rollup')
    expect(wrapper.text()).toContain('Feature-wide rollups across all of the Feature')

    filters[0].vm.$emit('toggle', 'design')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="feature-card"]').map(c => c.get('a').text())).toEqual(['OSAC-2'])
    expect(wrapper.get('[data-testid="clear-board-filters"]').exists()).toBe(true)

    await wrapper.get('[data-testid="clear-board-filters"]').trigger('click')
    expect(wrapper.findAll('[data-testid="feature-card"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="clear-board-filters"]').exists()).toBe(false)
  })

  it('leaves Clear to the filter bar when one of its filters is active', async () => {
    const { wrapper } = await mountView()
    await search(wrapper, 'wizard')
    expect(wrapper.find('[data-testid="clear-board-filters"]').exists()).toBe(true)
    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('toggle-priority', 'Major')
    await flushPromises()
    expect(wrapper.find('[data-testid="clear-board-filters"]').exists()).toBe(false)
    wrapper.getComponent(ComponentStatusFilterBar).vm.$emit('clear')
    await flushPromises()
    expect(wrapper.get('#ui-ux-board-search').element.value).toBe('')
    expect(wrapper.findAll('[data-testid="feature-card"]')).toHaveLength(2)
  })

  it('names the Jira status control and its Match on selector', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.getComponent(ComponentStatusFilterBar).props('statusLabel')).toBe('Jira status')
    expect(wrapper.get('label[for="ui-ux-board-match-on"]').text()).toBe('Match Jira status, assignee, priority on')
    expect(wrapper.findAll('label').map(l => l.text())).toContain('Jira status')
  })
})

