/**
 * Sustaining ("BU Feedback") tab must no longer be reachable from Plan nav.
 * PM Hub tab must no longer be reachable from Plan nav.
 */
import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import PlanView from '../../../client/views/PlanView.vue'

describe('PlanView sub-tabs', () => {
  it('does not show a Sustaining tab', () => {
    const wrapper = shallowMount(PlanView)
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).not.toContain('Sustaining')
  })

  it('does not show a PM Hub tab', () => {
    const wrapper = shallowMount(PlanView)
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).not.toContain('PM Hub')
  })

  it('still shows the other Plan tabs', () => {
    const wrapper = shallowMount(PlanView)
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).toEqual(['Big Rocks', 'Features List (1-n)'])
  })

  it('falls back to Big Rocks if a bu-feedback tab param is requested', () => {
    const wrapper = shallowMount(PlanView, {
      global: {
        provide: {
          moduleNav: { params: { value: { tab: 'bu-feedback' } }, updateParams: () => {} },
        },
      },
    })
    const activeButton = wrapper.findAll('nav button').find(b => b.classes().some(c => c.includes('border-primary-500')))
    expect(activeButton.text()).toBe('Big Rocks')
  })

  it('falls back to Big Rocks if a pm-hub tab param is requested', () => {
    const wrapper = shallowMount(PlanView, {
      global: {
        provide: {
          moduleNav: { params: { value: { tab: 'pm-hub' } }, updateParams: () => {} },
        },
      },
    })
    const activeButton = wrapper.findAll('nav button').find(b => b.classes().some(c => c.includes('border-primary-500')))
    expect(activeButton.text()).toBe('Big Rocks')
  })
})
