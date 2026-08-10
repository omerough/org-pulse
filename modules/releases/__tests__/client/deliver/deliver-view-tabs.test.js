/**
 * CP2 — Conforma tab must no longer be reachable from Deliver nav.
 */
import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import DeliverView from '../../../client/views/DeliverView.vue'

vi.mock('@shared/client/services/api', () => ({
  apiRequest: () => Promise.resolve({ releases: [] }),
  SESSION_CACHE_PREFIX: 'test:',
}))

describe('DeliverView sub-tabs', () => {
  it('does not show a Conforma Insights tab', async () => {
    const wrapper = shallowMount(DeliverView)
    await flushPromises()
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).not.toContain('Conforma Insights')
  })

  it('still shows the other Deliver tabs', async () => {
    const wrapper = shallowMount(DeliverView)
    await flushPromises()
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).toEqual(['Risk Dashboard', 'Post-Release Defects'])
  })
})
