import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentBreakdown from '../../client/components/AssessmentBreakdown.vue'

function mountWith(assessment, detail = null) {
  return mount(AssessmentBreakdown, { props: { assessment, detail } })
}

describe('AssessmentBreakdown rubric versioning', () => {
  it('renders v2 criterion labels for a v2 assessment', () => {
    const wrapper = mountWith({
      rubricVersion: 'v2',
      scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
      total: 9,
      passFail: 'PASS'
    })
    const text = wrapper.text()
    expect(text).toContain('User-Facing Focus')
    expect(text).toContain('Right-Sized')
    expect(text).toContain('Testability')
    expect(text).not.toContain('How')
  })

  it('renders v1 criterion labels for a v1 assessment', () => {
    const wrapper = mountWith({
      rubricVersion: 'v1',
      scores: { what: 2, why: 2, how: 1, task: 2, size: 2 },
      total: 9,
      passFail: 'PASS'
    })
    const text = wrapper.text()
    expect(text).toContain('How')
    expect(text).toContain('Task')
    expect(text).not.toContain('User-Facing Focus')
  })

  it('infers v2 from score keys when rubricVersion is absent', () => {
    const wrapper = mountWith({
      scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
      total: 9,
      passFail: 'PASS'
    })
    expect(wrapper.text()).toContain('User-Facing Focus')
  })
})

describe('AssessmentBreakdown criterion selection', () => {
  const assessment = {
    rubricVersion: 'v2',
    scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
    total: 9,
    passFail: 'PASS'
  }
  const detail = {
    latest: {
      criterionNotes: {
        what: 'Note about what.',
        rightSized: 'Note about right-sized.'
      }
    }
  }

  function cardFor(wrapper, label) {
    return wrapper.findAll('.grid > div').find(c => c.text().includes(label))
  }

  it('keeps the 2-column grid intact when a criterion is selected', async () => {
    const wrapper = mountWith(assessment, detail)
    const grid = wrapper.find('.grid')
    expect(grid.classes()).toContain('grid-cols-2')

    await cardFor(wrapper, 'What').trigger('click')

    expect(grid.classes()).toContain('grid-cols-2')
    grid.findAll(':scope > div').forEach(card => {
      expect(card.classes()).not.toContain('col-span-2')
    })
  })

  it('shows the selected note in a detail area below the grid', async () => {
    const wrapper = mountWith(assessment, detail)
    expect(wrapper.text()).not.toContain('Note about what.')

    await cardFor(wrapper, 'What').trigger('click')

    expect(wrapper.text()).toContain('Note about what.')
  })

  it('switching selection replaces the displayed explanation', async () => {
    const wrapper = mountWith(assessment, detail)

    await cardFor(wrapper, 'What').trigger('click')
    expect(wrapper.text()).toContain('Note about what.')
    expect(wrapper.text()).not.toContain('Note about right-sized.')

    await cardFor(wrapper, 'Right-Sized').trigger('click')
    expect(wrapper.text()).toContain('Note about right-sized.')
    expect(wrapper.text()).not.toContain('Note about what.')
  })

  it('clicking the selected card again closes the detail panel', async () => {
    const wrapper = mountWith(assessment, detail)
    const card = cardFor(wrapper, 'What')

    await card.trigger('click')
    expect(wrapper.text()).toContain('Note about what.')

    await card.trigger('click')
    expect(wrapper.text()).not.toContain('Note about what.')
  })

  it('does not select criteria that have no notes', async () => {
    const wrapper = mountWith(assessment, detail)
    await cardFor(wrapper, 'Why').trigger('click')
    expect(wrapper.text()).not.toContain('Note about')
  })
})

describe('AssessmentBreakdown score/result presentation', () => {
  it('renders the ratio as one value and Result as its own status badge, preserving passFail', () => {
    const wrapper = mountWith({
      rubricVersion: 'v2',
      scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
      total: 9,
      passFail: 'PASS'
    })

    expect(wrapper.text()).toContain('Score')
    expect(wrapper.text()).toContain('9/10')
    expect(wrapper.text()).toContain('Result')
    expect(wrapper.text()).toContain('PASS')
  })

  it('reflects an authoritative FAIL passFail even if the numeric score looks high', () => {
    const wrapper = mountWith({
      rubricVersion: 'v2',
      scores: { what: 2, why: 2, userFacing: 2, rightSized: 2, testability: 1 },
      total: 9,
      passFail: 'FAIL'
    })

    expect(wrapper.text()).toContain('9/10')
    expect(wrapper.text()).toContain('FAIL')
  })
})
