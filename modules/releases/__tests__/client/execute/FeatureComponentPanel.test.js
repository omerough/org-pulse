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

  it('links the Feature and its Epics to Jira and offers no Feature Detail entry point', () => {
    const wrapper = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9')] })])
    const links = wrapper.findAll('a').map(a => [a.text(), a.attributes('href')])
    expect(links).toEqual([
      ['OSAC-1', 'https://redhat.atlassian.net/browse/OSAC-1'],
      ['OSAC-9', 'https://redhat.atlassian.net/browse/OSAC-9']
    ])
    expect(wrapper.find('[data-testid="open-feature"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Details')
  })

  it('lists every source Epic with its own status, local workstream status and Fix Version', () => {
    const wrapper = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9')] })])
    const row = wrapper.get('[data-testid="source-row"]')
    expect(row.find('a[href="https://redhat.atlassian.net/browse/OSAC-9"]').exists()).toBe(true)
    expect(row.text()).toContain('UIX')
    expect(row.text()).toContain('Epic Owner')
    expect(row.get('[data-testid="source-ux"]').text()).toBe('In Progress')
    expect(row.get('[data-testid="source-ui"]').text()).toBe('Not Started')
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

  it('aligns every source Epic into the same fixed columns under labelled headers', () => {
    const wrapper = mountPanel([card('OSAC-1', {
      sources: [sourceRow('OSAC-9'), sourceRow('OSAC-10', { epicType: 'bootstrap', fixVersions: [] })]
    })])
    expect(wrapper.findAll('thead th').map(th => th.text())).toEqual(['Epic', 'Type', 'Status', 'Assignee', 'Priority', 'Release', 'UX', 'UI'])
    const rows = wrapper.findAll('[data-testid="source-row"]')
    expect(rows.map(r => r.findAll('td').length)).toEqual([8, 8])
    expect(rows[0].findAll('td').map(td => td.text())).toEqual(['OSAC-9', 'UIX', 'In Progress', 'Epic Owner', 'Normal', '0.4', 'In Progress', 'Not Started'])
    expect(rows[1].findAll('td')[5].text()).toBe('—')
  })

  it('keeps the column layout with a placeholder when a legacy payload omits Epic fields', () => {
    const legacy = sourceRow('OSAC-9', { status: undefined, assignee: undefined, priority: undefined, resolution: undefined })
    const cells = mountPanel([card('OSAC-1', { sources: [legacy] })]).get('[data-testid="source-row"]').findAll('td')
    expect(cells).toHaveLength(8)
    expect([2, 3, 4].map(i => cells[i].text())).toEqual(['—', '—', '—'])
  })

  it('shows the Feature fields under their labels and captions the badges as the Feature-wide Epic rollup', () => {
    const wrapper = mountPanel([card('OSAC-1')])
    const text = wrapper.get('[data-testid="feature-card"]').text()
    expect(text).toContain('Feature-wide Epic rollup')
    expect(wrapper.get('[data-testid="rollup"]').attributes('title')).toContain('regardless of Release or Component')
    expect(text).toMatch(/Status\s*In Progress/)
    expect(text).toMatch(/Priority\s*Major/)
    expect(text).toMatch(/Assignee\s*Feature Owner/)
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

  it('stays expanded when the cards array is rebuilt with the same Features, and resets when they change', async () => {
    const make = count => Array.from({ length: count }, (_, i) => card(`OSAC-${i + 1}`))
    const wrapper = mountPanel(make(12))
    await wrapper.get('[data-testid="show-more-toggle"]').trigger('click')
    expect(wrapper.findAll('[data-testid="feature-card"]')).toHaveLength(12)

    await wrapper.setProps({ cards: make(12) })
    expect(wrapper.findAll('[data-testid="feature-card"]')).toHaveLength(12)

    await wrapper.setProps({ cards: make(11) })
    expect(wrapper.findAll('[data-testid="feature-card"]')).toHaveLength(10)
  })

  describe('Epic disclosure', () => {
    const withEpics = overrides => card('OSAC-1', { sources: [sourceRow('OSAC-9'), sourceRow('OSAC-10')], ...overrides })
    const table = wrapper => wrapper.get('[data-testid="feature-card"] table').element.parentElement

    it('collapses the Epic table by default behind a count button', () => {
      const wrapper = mountPanel([withEpics()])
      const toggle = wrapper.get('[data-testid="epics-toggle"]')
      expect(toggle.text()).toBe('2 Epics')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(table(wrapper).style.display).toBe('none')
      expect(toggle.attributes('aria-controls')).toBe(table(wrapper).id)
    })

    it('uses the singular for one Epic and keeps the Feature header visible while collapsed', () => {
      const wrapper = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9')] })])
      expect(wrapper.get('[data-testid="epics-toggle"]').text()).toBe('1 Epic')
      expect(wrapper.get('[data-testid="ux-badge"]').isVisible()).toBe(true)
      expect(wrapper.get('a[href$="/OSAC-1"]').isVisible()).toBe(true)
    })

    it('expands the listed Features and asks the parent to toggle on click', async () => {
      const wrapper = mountPanel([withEpics()], { expandedKeys: new Set(['OSAC-1']) })
      const toggle = wrapper.get('[data-testid="epics-toggle"]')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(table(wrapper).style.display).not.toBe('none')
      await toggle.trigger('click')
      expect(wrapper.emitted('toggle-epics')).toEqual([['OSAC-1']])
    })

    it('shows how many Epic rows matched next to the count', () => {
      const one = mountPanel([withEpics({ sources: [sourceRow('OSAC-9', { matched: true }), sourceRow('OSAC-10')] })])
      expect(one.get('[data-testid="epics-match-count"]').text()).toContain('1 match')
      const two = mountPanel([withEpics({ sources: [sourceRow('OSAC-9', { matched: true }), sourceRow('OSAC-10', { matched: true })] })])
      expect(two.get('[data-testid="epics-match-count"]').text()).toContain('2 matches')
      expect(mountPanel([withEpics()]).find('[data-testid="epics-match-count"]').exists()).toBe(false)
    })
  })

  describe('UX and UI columns', () => {
    const dotOf = cell => cell.get('span[aria-hidden="true"]')

    it('pairs readable text with a status dot and keeps neutral states unfilled', () => {
      const row = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9', { ux: 'in-progress', ui: 'not-started' })] })])
        .get('[data-testid="source-row"]')
      const ux = row.get('[data-testid="source-ux"]')
      const ui = row.get('[data-testid="source-ui"]')
      expect(ux.text()).toBe('In Progress')
      expect(dotOf(ux).classes()).toContain('bg-blue-500')
      expect(ui.text()).toBe('Not Started')
      expect(dotOf(ui).classes()).not.toContain('bg-blue-500')
      expect(dotOf(ui).classes().some(c => c.startsWith('bg-'))).toBe(false)
      expect(ui.get('span').classes()).toContain('text-gray-500')
    })

    it('colours design, completed and unknown from the shared status vocabulary', () => {
      const row = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9', { ux: 'design', ui: 'completed' })] })])
        .get('[data-testid="source-row"]')
      expect(dotOf(row.get('[data-testid="source-ux"]')).classes()).toContain('bg-indigo-500')
      expect(dotOf(row.get('[data-testid="source-ui"]')).classes()).toContain('bg-emerald-500')
      const unknown = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9', { ux: 'unknown', ui: 'unknown' })] })])
      expect(unknown.get('[data-testid="source-ux"]').text()).toBe('Unknown')
      expect(unknown.findAll('[data-testid="source-row"] span[aria-hidden="true"]').every(dot => !dot.classes().some(c => c.startsWith('bg-')))).toBe(true)
    })

    it('shows a dash for a workstream the Epic does not feed', () => {
      const row = mountPanel([card('OSAC-1', { sources: [sourceRow('OSAC-9', { ux: 'in-progress', ui: null })] })])
        .get('[data-testid="source-row"]')
      expect(row.get('[data-testid="source-ui"]').text()).toBe('—')
      expect(row.get('[data-testid="source-ux"]').text()).toBe('In Progress')
    })
  })
})
