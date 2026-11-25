import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockProjectId = await vi.hoisted(async () => (await import('vue')).ref(''))
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId
}))

import ExecuteView from '../../../client/views/ExecuteView.vue'

const FLIGHTCTL_TABS = ['Feature List']
const ALL_TABS = ['Feature List', 'Feature Tracking', 'Epics by Release', 'UI/UX by Component']

function mountView(projectId, tab = undefined) {
  mockProjectId.value = projectId
  const nav = { params: ref({ tab }), updateParams: vi.fn() }
  const wrapper = shallowMount(ExecuteView, { global: { provide: { moduleNav: nav } } })
  return { wrapper, nav }
}

const tabLabels = wrapper => wrapper.findAll('nav button').map(button => button.text())

describe('shared Execute presentation', () => {
  beforeEach(() => {
    mockProjectId.value = ''
  })

  it.each(['osac', ''])('shows the UI/UX by Component tab for project "%s"', async (projectId) => {
    const { wrapper } = mountView(projectId)

    expect(tabLabels(wrapper)).toEqual(ALL_TABS)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(false)

    await wrapper.findAll('nav button')[2].trigger('click')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
    await wrapper.findAll('nav button')[3].trigger('click')
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('clears the board release from the URL in the same update that changes the tab', async () => {
    const { wrapper, nav } = mountView('osac', 'ui-epics-by-component')
    await nextTick()
    await nextTick()
    await wrapper.findAll('nav button')[2].trigger('click')
    const [params] = nav.updateParams.mock.calls.at(-1)
    expect(params.tab).toBe('epics-by-release')
    expect(Object.keys(params)).toContain('release')
    expect(params.release).toBeUndefined()
    wrapper.unmount()
  })

  it.each([
    ['another tab', 'feature-tracking'],
    ['an unknown tab', 'no-such-tab'],
    ['the default tab', undefined]
  ])('drops a stale release from a URL that resolves to %s, in place', async (_, tab) => {
    mockProjectId.value = 'osac'
    const nav = { params: ref({ tab, release: '0.5' }), updateParams: vi.fn() }
    const wrapper = shallowMount(ExecuteView, { global: { provide: { moduleNav: nav } } })
    await nextTick()
    expect(nav.updateParams).toHaveBeenCalledWith({ release: undefined }, { push: false })
    wrapper.unmount()
  })

  it('drops a stale release when a URL-driven change leaves the board tab', async () => {
    const { wrapper, nav } = mountView('osac', 'ui-epics-by-component')
    nav.params.value = { tab: 'ui-epics-by-component', release: '0.5' }
    await nextTick()
    expect(nav.updateParams).not.toHaveBeenCalled()

    nav.params.value = { tab: 'epics-by-release', release: '0.5' }
    await nextTick()
    expect(nav.updateParams).toHaveBeenCalledWith({ release: undefined }, { push: false })
    wrapper.unmount()
  })

  it('keeps the release of a board URL, such as the Feature Detail return', async () => {
    const nav = { params: ref({ tab: 'ui-epics-by-component', release: '0.5' }), updateParams: vi.fn() }
    mockProjectId.value = 'osac'
    const wrapper = shallowMount(ExecuteView, { global: { provide: { moduleNav: nav } } })
    await nextTick()
    expect(nav.updateParams).not.toHaveBeenCalled()
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows only Feature List for Flight Control', () => {
    const { wrapper } = mountView('flightctl')

    expect(tabLabels(wrapper)).toEqual(FLIGHTCTL_TABS)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the selected tab when the project changes', async () => {
    const { wrapper } = mountView('osac', 'feature-tracking')
    expect(wrapper.find('feature-tracking-view-stub').exists()).toBe(true)

    // ExecuteView owns presentation; the project selector changes only the
    // data fetched by the mounted tab content.
    await nextTick()
    expect(tabLabels(wrapper)).toEqual(ALL_TABS)
    expect(wrapper.find('feature-tracking-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each([
    ['feature-tracking', 'feature-tracking-view-stub'],
    ['epics-by-release', 'epics-by-release-view-stub']
  ])('restores the %s tab from the URL for OSAC', (tab, stub) => {
    const { wrapper } = mountView('osac', tab)
    expect(wrapper.find(stub).exists()).toBe(true)
    wrapper.unmount()
  })

  it.each([
    ['feature-tracking', 'feature-tracking-view-stub'],
    ['epics-by-release', 'epics-by-release-view-stub']
  ])('falls back to Feature List for a Flight Control deep link to %s', (tab, stub) => {
    const { wrapper } = mountView('flightctl', tab)
    expect(wrapper.find(stub).exists()).toBe(false)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('falls back to Feature List for the retired feature-status tab id', () => {
    const { wrapper } = mountView('osac', 'feature-status')
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    expect(tabLabels(wrapper)).not.toContain('Hygiene')
    wrapper.unmount()
  })

  it('opens the UI/UX by Component tab from a deep link', () => {
    const { wrapper } = mountView('osac', 'ui-epics-by-component')
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('ignores a deep link to the tab for a project without a dashboard config', () => {
    const { wrapper } = mountView('flightctl', 'ui-epics-by-component')
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(false)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['feature-tracking', 'epics-by-release'])('leaves the %s tab when the project switches to Flight Control', async (tab) => {
    const { wrapper } = mountView('osac', tab)
    expect(wrapper.find(`${tab}-view-stub`).exists()).toBe(true)

    mockProjectId.value = 'flightctl'
    await nextTick()
    await nextTick()

    expect(tabLabels(wrapper)).toEqual(FLIGHTCTL_TABS)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('leaves the tab when the project switches to one without a dashboard config', async () => {
    const { wrapper } = mountView('osac', 'ui-epics-by-component')
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(true)

    mockProjectId.value = 'flightctl'
    await nextTick()
    await nextTick()

    expect(tabLabels(wrapper)).toEqual(FLIGHTCTL_TABS)
    expect(wrapper.find('ui-ux-by-component-view-stub').exists()).toBe(false)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })
})
