import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeatureTrackingView from '../../client/execute/views/FeatureTrackingView.vue'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))

const RELEASES = { releases: [{ releaseId: 'osac-0.2-M1', displayName: 'OSAC 0.2-M1' }] }

const TRACKING_DATA = {
  schemaVersion: 1,
  releaseId: 'osac-0.2-M1',
  displayName: 'OSAC 0.2-M1',
  fixVersions: ['0.2-M1'],
  baselineDate: '2026-07-08',
  baselineSource: 'releaseStart+7d',
  fetchedAt: '2026-08-17T03:09:41Z',
  featureCount: 3,
  counts: { committed: 3, added: 0, dropped: 0, moved: 0, unknown: 0, blockerPriority: 0 },
  wasQueryFailed: false,
  features: [
    { key: 'OSAC-1', summary: 'Feature one', status: 'In Progress', components: ['Comp A'], scopeChange: null },
    { key: 'OSAC-2', summary: 'Feature two', status: 'Done', components: ['Comp B'], scopeChange: null },
    { key: 'OSAC-3', summary: 'Feature three', status: 'Done', components: [], scopeChange: null }
  ]
}

async function mountWithData() {
  mockApiRequest.mockImplementation((url) => {
    if (url.indexOf('/tracking/releases') !== -1) return Promise.resolve(RELEASES)
    return Promise.resolve(TRACKING_DATA)
  })
  const wrapper = mount(FeatureTrackingView)
  await flushPromises()
  return wrapper
}

async function openDropdown(wrapper, currentLabel) {
  const button = wrapper.findAll('button[aria-haspopup="listbox"]').find(b => b.text().includes(currentLabel))
  await button.trigger('click')
}

async function checkOption(wrapper, optionText) {
  const label = wrapper.findAll('label').find(l => l.text() === optionText)
  await label.find('input[type="checkbox"]').setValue(true)
}

describe('FeatureTrackingView Component / Status filters', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
  })

  it('narrows the table by a single selected Component', async () => {
    const wrapper = await mountWithData()

    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Comp A')

    expect(wrapper.text()).toContain('OSAC-1')
    expect(wrapper.text()).not.toContain('OSAC-2')
    expect(wrapper.text()).not.toContain('OSAC-3')
  })

  it('matches with OR semantics when multiple Components are selected', async () => {
    const wrapper = await mountWithData()

    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Comp A')
    await checkOption(wrapper, 'Comp B')

    expect(wrapper.text()).toContain('OSAC-1')
    expect(wrapper.text()).toContain('OSAC-2')
    expect(wrapper.text()).not.toContain('OSAC-3')
  })

  it('keeps components-less features visible/selectable via the Unassigned bucket', async () => {
    const wrapper = await mountWithData()

    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Unassigned')

    expect(wrapper.text()).toContain('OSAC-3')
    expect(wrapper.text()).not.toContain('OSAC-1')
    expect(wrapper.text()).not.toContain('OSAC-2')
  })

  it('combines a Status filter with a Component filter', async () => {
    const wrapper = await mountWithData()

    await openDropdown(wrapper, 'All statuses')
    await checkOption(wrapper, 'Done')
    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Comp B')

    expect(wrapper.text()).toContain('OSAC-2')
    expect(wrapper.text()).not.toContain('OSAC-1')
    expect(wrapper.text()).not.toContain('OSAC-3')
  })

  it('clearing filters restores all features', async () => {
    const wrapper = await mountWithData()

    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Comp A')
    expect(wrapper.text()).not.toContain('OSAC-2')

    const clearButton = wrapper.findAll('button').find(b => b.text().includes('Clear filters'))
    await clearButton.trigger('click')

    expect(wrapper.text()).toContain('OSAC-1')
    expect(wrapper.text()).toContain('OSAC-2')
    expect(wrapper.text()).toContain('OSAC-3')
  })

  it('clears active Component/Status selections when the selected Release changes', async () => {
    const releases = {
      releases: [
        { releaseId: 'osac-0.2-M1', displayName: 'OSAC 0.2-M1' },
        { releaseId: 'osac-0.3', displayName: 'OSAC 0.3' }
      ]
    }
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/tracking/releases') !== -1) return Promise.resolve(releases)
      return Promise.resolve(TRACKING_DATA)
    })
    const wrapper = mount(FeatureTrackingView)
    await flushPromises()

    await openDropdown(wrapper, 'All components')
    await checkOption(wrapper, 'Comp A')
    expect(wrapper.text()).not.toContain('OSAC-2')

    const nextRelease = wrapper.findAll('button').find(b => b.text().includes('OSAC 0.3'))
    await nextRelease.trigger('click')
    await flushPromises()

    const componentButton = wrapper.findAll('button[aria-haspopup="listbox"]').find(b => b.text().includes('components'))
    expect(componentButton.text()).toContain('All components')
    expect(wrapper.text()).toContain('OSAC-2')
  })
})
