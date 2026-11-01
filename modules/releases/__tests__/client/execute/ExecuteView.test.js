import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockProjectId = await vi.hoisted(async () => (await import('vue')).ref(''))
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId
}))

import ExecuteView from '../../../client/views/ExecuteView.vue'

const BASE_TABS = ['Feature List', 'Hygiene', 'Feature Tracking', 'Epics by Release']
const ALL_TABS = [...BASE_TABS, 'UI Epics by Component']

function mountView(projectId, tab = undefined) {
  mockProjectId.value = projectId
  const nav = { params: ref({ tab }), updateParams: () => {} }
  const wrapper = shallowMount(ExecuteView, { global: { provide: { moduleNav: nav } } })
  return { wrapper, nav }
}

const tabLabels = wrapper => wrapper.findAll('nav button').map(button => button.text())

describe('shared Execute presentation', () => {
  beforeEach(() => {
    mockProjectId.value = ''
  })

  it.each(['osac', ''])('shows the UI Epics by Component tab for project "%s"', async (projectId) => {
    const { wrapper } = mountView(projectId)

    expect(tabLabels(wrapper)).toEqual(ALL_TABS)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(false)

    await wrapper.findAll('nav button')[3].trigger('click')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
    await wrapper.findAll('nav button')[4].trigger('click')
    expect(wrapper.find('epics-by-component-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides the UI Epics by Component tab for a project without a dashboard config', async () => {
    const { wrapper } = mountView('flightctl')

    expect(tabLabels(wrapper)).toEqual(BASE_TABS)
    await wrapper.findAll('nav button')[3].trigger('click')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
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

  it('restores a valid tab from the URL, including the established hygiene route id', async () => {
    const { wrapper } = mountView('flightctl', 'epics-by-release')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
    wrapper.unmount()

    const hygiene = mountView('osac', 'feature-status').wrapper
    expect(hygiene.find('hygiene-view-stub').exists()).toBe(true)
    expect(hygiene.text()).toContain('Hygiene')
    hygiene.unmount()
  })

  it('opens the UI Epics by Component tab from a deep link', () => {
    const { wrapper } = mountView('osac', 'ui-epics-by-component')
    expect(wrapper.find('epics-by-component-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('ignores a deep link to the tab for a project without a dashboard config', () => {
    const { wrapper } = mountView('flightctl', 'ui-epics-by-component')
    expect(wrapper.find('epics-by-component-view-stub').exists()).toBe(false)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('leaves the tab when the project switches to one without a dashboard config', async () => {
    const { wrapper } = mountView('osac', 'ui-epics-by-component')
    expect(wrapper.find('epics-by-component-view-stub').exists()).toBe(true)

    mockProjectId.value = 'flightctl'
    await nextTick()
    await nextTick()

    expect(tabLabels(wrapper)).toEqual(BASE_TABS)
    expect(wrapper.find('epics-by-component-view-stub').exists()).toBe(false)
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })
})
