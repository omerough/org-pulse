import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeatureTrackingTable from '../../client/execute/components/FeatureTrackingTable.vue'

describe('FeatureTrackingTable', function() {
  it('shows the default filter-empty message when no props are given', function() {
    var wrapper = mount(FeatureTrackingTable, { props: { features: [] } })
    expect(wrapper.text()).toContain('No features match this filter.')
  })

  it('shows a caller-supplied empty message and detail line instead of the default', function() {
    var wrapper = mount(FeatureTrackingTable, {
      props: {
        features: [],
        emptyMessage: 'No Feature-level scope was found for this release or milestone.',
        emptyMessageDetail: 'Epics may still be assigned to this milestone and are shown in Epics by Release.'
      }
    })
    expect(wrapper.text()).toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('Epics may still be assigned to this milestone and are shown in Epics by Release.')
    expect(wrapper.text()).not.toContain('No features match this filter.')
  })

  it('does not render any empty-state message when features are present', function() {
    var wrapper = mount(FeatureTrackingTable, {
      props: {
        features: [{ key: 'OSAC-1', summary: 'Feature one', status: 'In Progress', components: [] }],
        emptyMessage: 'No Feature-level scope was found for this release or milestone.'
      }
    })
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
  })
})
