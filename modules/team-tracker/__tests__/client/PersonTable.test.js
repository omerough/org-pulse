import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PersonTable from '../../client/components/PersonTable.vue'

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (mod, view, params) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      return `#/${mod}/${view}${qs ? `?${qs}` : ''}`
    }
  })
}))

const { mockProjectId } = vi.hoisted(() => ({ mockProjectId: { value: 'osac' } }))
const noContributions = () => null
vi.mock('@shared/client/composables/useProjectId', () => ({
  useProjectId: () => mockProjectId,
  projectParam: (id) => (id ? { projectId: id } : {})
}))

// OSAC-5968: this list's name link bypasses the row's @select emit, so it
// must carry the project context and accountId identity on its own href.
describe('PersonTable project context preservation (OSAC-5968)', () => {
  beforeEach(() => {
    mockProjectId.value = 'osac'
  })

  it('preserves the selected project and uses accountId identity for a project-qualified member', () => {
    mockProjectId.value = 'flightctl'
    const member = { name: 'Priya Shah', accountId: 'acc-123' }
    const wrapper = mount(PersonTable, { props: { members: [member], teamKey: 'flightctl::Core', getGithubContribution: noContributions } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('projectId=flightctl')
    expect(href).toContain('accountId=acc-123')
    expect(href).not.toContain('person=')
  })

  it('shows published GitHub counts, distinguishes unpublished from no identity, and reports GitLab as unsupported', () => {
    const members = [
      { name: 'Ada', accountId: 'acc-1' },
      { name: 'Bob', accountId: 'acc-2' },
      { name: 'Cy', accountId: 'acc-3' }
    ]
    const records = {
      'acc-1': { github: { totalContributions: 42 } },
      'acc-2': { github: {} }
    }
    const wrapper = mount(PersonTable, {
      props: { members, getGithubContribution: id => records[id] ?? null }
    })

    const cells = wrapper.findAll('tbody tr').map(tr => tr.findAll('td'))
    expect(cells[0][4].text()).toBe('42')
    expect(cells[1][4].text()).toBe('—')
    expect(cells[2][4].text()).toBe('no GitHub')
    for (const row of cells) expect(row[5].text()).toBe('Unsupported')
  })

  it('emits select with the member when a row is clicked', async () => {
    const member = { name: 'Ada', accountId: 'acc-1' }
    const wrapper = mount(PersonTable, { props: { members: [member], getGithubContribution: noContributions } })

    await wrapper.find('tbody tr').trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual([member])
  })
})

// The column headers})

// The column headers must reflect the real measured lookback window, or
// stay neutral when it isn't known -- never hardcode "(90d)".
describe('PersonTable lookback-window column labels', () => {
  function headerText(wrapper, label) {
    return wrapper.findAll('th').map(th => th.text()).some(text => text.includes(label))
  }

  it('labels the columns with the real lookback window when every member agrees', () => {
    const members = [
      { name: 'Ada', accountId: 'acc-1' },
      { name: 'Bob', accountId: 'acc-2' }
    ]
    const memberMetrics = new Map([
      ['acc-1', { lookbackDays: 365, resolvedCount: 2, resolvedPoints: 3 }],
      ['acc-2', { lookbackDays: 365, resolvedCount: 1, resolvedPoints: 1 }]
    ])
    const wrapper = mount(PersonTable, { props: { members, memberMetrics, getGithubContribution: noContributions } })

    expect(headerText(wrapper, 'Resolved (365d)')).toBe(true)
    expect(headerText(wrapper, 'Points (365d)')).toBe(true)
    expect(headerText(wrapper, '(90d)')).toBe(false)
  })

  it('falls back to a neutral label when the lookback window is unknown or mixed', () => {
    const members = [
      { name: 'Ada', accountId: 'acc-1' },
      { name: 'Bob', accountId: 'acc-2' }
    ]
    const memberMetrics = new Map([
      ['acc-1', { lookbackDays: 365, resolvedCount: 2, resolvedPoints: 3 }],
      ['acc-2', { lookbackDays: 90, resolvedCount: 1, resolvedPoints: 1 }]
    ])
    const wrapper = mount(PersonTable, { props: { members, memberMetrics, getGithubContribution: noContributions } })

    expect(headerText(wrapper, 'Resolved (')).toBe(false)
    expect(headerText(wrapper, 'Points (')).toBe(false)
    expect(headerText(wrapper, 'Resolved')).toBe(true)
    expect(headerText(wrapper, 'Points')).toBe(true)
  })
})
