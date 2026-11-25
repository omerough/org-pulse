import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComponentStatusFilterBar from '../../../client/execute/components/ComponentStatusFilterBar.vue'

const mountBar = (props = {}) => mount(ComponentStatusFilterBar, { props: { statusOptions: ['Done'], ...props } })
const labels = wrapper => wrapper.findAll('label').map(label => label.text())

describe('ComponentStatusFilterBar status label', () => {
  it('keeps "Status" for consumers that do not pass a label', () => {
    expect(labels(mountBar())).toEqual(['Status'])
  })

  it('shows a caller-supplied label without changing the "All statuses" placeholder', () => {
    const wrapper = mountBar({ statusLabel: 'Jira status' })
    expect(labels(wrapper)).toEqual(['Jira status'])
    expect(wrapper.text()).toContain('All statuses')
  })
})
