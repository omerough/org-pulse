import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EpicComponentPanel from '../../../client/execute/components/EpicComponentPanel.vue'
import { epic } from './uiEpicsFixture'

const rows = (count, overrides = {}) =>
  Array.from({ length: count }, (_, i) => ({ epic: epic(`OSAC-${i + 1}`, overrides), alsoIn: [] }))

function mountPanel(props = {}) {
  return mount(EpicComponentPanel, { props: { component: 'Core', rows: rows(3), ...props } })
}

describe('EpicComponentPanel', () => {
  it('renders one table row and one card per Epic with a Jira link', () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('[data-testid="epic-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="epic-card"]')).toHaveLength(3)
    const link = wrapper.find('[data-testid="epic-row"] a')
    expect(link.attributes('href')).toBe('https://redhat.atlassian.net/browse/OSAC-1')
  })

  it('shows the count pill and the display label for the component', () => {
    const wrapper = mountPanel({ component: 'Connectivity&Fabric' })
    expect(wrapper.text()).toContain('Connectivity & Fabric')
    expect(wrapper.find('[data-testid="panel-count"]').text()).toBe('3')
  })

  it('shows "x of y" in the pill when filters narrow the panel', () => {
    const wrapper = mountPanel({ memberCount: 5 })
    expect(wrapper.find('[data-testid="panel-count"]').text()).toBe('3 of 5')
  })

  it('shows the first 10 rows, then reveals and re-collapses the rest', async () => {
    const wrapper = mountPanel({ rows: rows(13) })
    expect(wrapper.findAll('[data-testid="epic-row"]')).toHaveLength(10)

    const toggle = wrapper.find('[data-testid="show-more-toggle"]')
    expect(toggle.text()).toBe('Show 3 more')
    await toggle.trigger('click')
    expect(wrapper.findAll('[data-testid="epic-row"]')).toHaveLength(13)
    expect(toggle.text()).toBe('Show fewer')

    await toggle.trigger('click')
    expect(wrapper.findAll('[data-testid="epic-row"]')).toHaveLength(10)
  })

  it('has no show-more control at exactly the page size', () => {
    expect(mountPanel({ rows: rows(10) }).find('[data-testid="show-more-toggle"]').exists()).toBe(false)
  })

  it('collapses back to the first page when the rows change', async () => {
    const wrapper = mountPanel({ rows: rows(13) })
    await wrapper.find('[data-testid="show-more-toggle"]').trigger('click')
    await wrapper.setProps({ rows: rows(12) })
    expect(wrapper.findAll('[data-testid="epic-row"]')).toHaveLength(10)
  })

  it('collapses and expands from the header', async () => {
    const wrapper = mountPanel()
    const header = wrapper.find('h3 button')
    expect(header.attributes('aria-expanded')).toBe('true')
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#epic-panel-core').isVisible()).toBe(false)
  })

  it('renders an empty panel muted, collapsed, and expands when rows arrive', async () => {
    const wrapper = mountPanel({ rows: [] })
    expect(wrapper.text()).toContain('No matching Epics')
    expect(wrapper.find('h3 button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.classes()).toContain('opacity-70')

    await wrapper.setProps({ rows: rows(1) })
    expect(wrapper.find('h3 button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.classes()).not.toContain('opacity-70')
  })

  it('keeps a panel the user collapsed collapsed when filters empty and refill it', async () => {
    const wrapper = mountPanel()
    const header = wrapper.find('h3 button')
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('false')

    await wrapper.setProps({ rows: [] })
    await wrapper.setProps({ rows: rows(2) })
    expect(header.attributes('aria-expanded')).toBe('false')
  })

  it('keeps an empty panel the user expanded expanded when rows come and go', async () => {
    const wrapper = mountPanel({ rows: [] })
    const header = wrapper.find('h3 button')
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')

    await wrapper.setProps({ rows: rows(1) })
    await wrapper.setProps({ rows: [] })
    expect(header.attributes('aria-expanded')).toBe('true')
  })

  it('honors the last user toggle even when it equals the default', async () => {
    const wrapper = mountPanel({ rows: [] })
    const header = wrapper.find('h3 button')
    await header.trigger('click')
    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('false')
    await wrapper.setProps({ rows: rows(1) })
    expect(header.attributes('aria-expanded')).toBe('false')
  })

  it('shows an also-in pointer only for Epics listed in several panels', () => {
    const wrapper = mountPanel({
      rows: [{ epic: epic('OSAC-1'), alsoIn: ['Connectivity&Fabric', 'Core'] }, { epic: epic('OSAC-2'), alsoIn: [] }]
    })
    const chips = wrapper.findAll('[data-testid="also-in"]')
    expect(chips).toHaveLength(1)
    expect(chips[0].text()).toBe('also in: Connectivity & Fabric, Core')
  })

  it('renders raw status, italic unassigned, priority, fix versions, and limits label chips', () => {
    const labels = ['bootstrap', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6']
    const wrapper = mountPanel({
      rows: [{ epic: epic('OSAC-1', { status: 'In Progress', priority: 'Major', fixVersions: ['0.4'], labels }), alsoIn: [] }]
    })
    const row = wrapper.find('[data-testid="epic-row"]')
    expect(row.text()).toContain('In Progress')
    expect(row.text()).toContain('Major')
    expect(row.text()).toContain('0.4')
    expect(row.find('.italic').text()).toBe('Unassigned')
    expect(row.text()).toContain('+2')
    expect(row.text()).not.toContain('l6')
  })
})
