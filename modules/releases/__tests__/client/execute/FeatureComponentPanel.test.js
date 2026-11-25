import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeatureComponentPanel from '../../../client/execute/components/FeatureComponentPanel.vue'

function card(key, overrides = {}) {
  return {
    key, summary: `${key} summary`, status: 'In Progress', resolution: null, priority: 'Major',
    assignee: 'Feature Owner', labels: ['customer:telus', 'osac-ui'], components: ['Core'],
    ui: { status: 'not-started', conflict: false }, ux: { status: 'in-progress', conflict: false },
    sources: [], alsoIn: [], otherReason: null, matchedVia: null, ...overrides
  }
}

function sourceRow(epicKey, overrides = {}) {
  return {
    epicKey, epicType: 'uix', status: 'In Progress', assignee: 'Epic Owner', priority: 'Normal',
    resolution: null, fixVersions: ['0.4'], components: [], ui: 'not-started', ux: 'in-progress',
    noWork: false, matched: false, ...overrides
  }
}

function mountPanel(cards, props = {}) {
  return mount(FeatureComponentPanel, { props: { component: 'Core', cards, ...props } })
}

describe('FeatureComponentPanel', () => {
  it('renders the Feature with Jira links, all labels and the published badges', () => {
    const wrapper = mountPanel([card('OSAC-1')])
    const link = wrapper.find('a[href="https://redhat.atlassian.net/browse/OSAC-1"]')
    expect(link.exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="feature-label"]').map(l => l.text())).toEqual(['customer:telus', 'osac-ui'])
    expect(wrapper.get('[data-testid="ux-badge"]').text()).toContain('In Progress')
    expect(wrapper.get('[data-testid="ui-badge"]').text()).toContain('Not Started')
  })

  it('emits open-feature from the Details button', async () => {
    const wrapper = mountPanel([card('OSAC-1')])
    await wrapper.get('[data-testid="open-feature"]').trigger('click')
    expect(wrapper.emitted('open-feature')).toEqual([['OSAC-1']])
  })

  it('lists every source Epic with its own status, local workstream status and Fix Version', () => {
    const wrapper = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9')] })])
    const row = wrapper.get('[data-testid="source-row"]')
    expect(row.find('a[href="https://redhat.atlassian.net/browse/OSAC-9"]').exists()).toBe(true)
    expect(row.text()).toContain('UIX')
    expect(row.text()).toContain('Epic Owner')
    expect(row.get('[data-testid="source-local-status"]').text()).toBe('UX In Progress · UI Not Started')
    expect(row.text()).toContain('0.4')
  })

  it('labels a no-work source with its resolution and explains it', () => {
    const wrapper = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9', { resolution: "Won't Do", noWork: true })] })])
    const chip = wrapper.get('[data-testid="no-work-chip"]')
    expect(chip.text()).toBe("Won't Do")
    expect(chip.attributes('title')).toContain('counted in the rollup')
  })

  it('omits Epic-level fields a legacy payload does not carry', () => {
    const legacy = sourceRow('OSAC-9', { status: undefined, assignee: undefined, priority: undefined, resolution: undefined })
    const wrapper = mountPanel([card('OSAC-1', { sources: [legacy] })])
    const text = wrapper.get('[data-testid="source-row"]').text()
    expect(text).not.toContain('Unassigned')
    expect(text).toContain('OSAC-9')
  })

  it('highlights matched source rows and states how the card matched', () => {
    const wrapper = mountPanel([card('OSAC-1', {
      sources: [sourceRow('OSAC-9', { matched: true }), sourceRow('OSAC-10')],
      matchedVia: { feature: true, epics: ['OSAC-9'] }
    })])
    const rows = wrapper.findAll('[data-testid="source-row"]')
    expect(rows.map(r => r.attributes('data-matched'))).toEqual(['true', undefined])
    expect(wrapper.get('[data-testid="matched-via"]').text()).toBe('Matched via Feature, OSAC-9')
  })

  it('shows alsoIn and the Other-panel reason chip', () => {
    const wrapper = mountPanel([card('OSAC-1', { alsoIn: ['Storage', 'Connectivity&Fabric'], otherReason: 'no component on Feature or source epics' })])
    expect(wrapper.get('[data-testid="also-in"]').text()).toBe('also in: Storage, Connectivity & Fabric')
    expect(wrapper.get('[data-testid="other-reason"]').text()).toContain('no component')
  })

  it('collapses when empty and pages long lists', async () => {
    const empty = mountPanel([])
    expect(empty.text()).toContain('No matching Features')
    expect(empty.find('[aria-expanded="false"]').exists()).toBe(true)

    const many = mountPanel(Array.from({ length: 12 }, (_, i) => card(`OSAC-${i + 1}`)), { memberCount: 15 })
    expect(many.findAll('[data-testid="feature-card"]')).toHaveLength(10)
    expect(many.get('[data-testid="panel-count"]').text()).toBe('12 of 15')
    await many.get('[data-testid="show-more-toggle"]').trigger('click')
    expect(many.findAll('[data-testid="feature-card"]')).toHaveLength(12)
  })
})
