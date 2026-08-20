import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AutofixContent from '../../client/components/AutofixContent.vue'

// Mock vue-chartjs
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    template: '<canvas data-testid="line-canvas"></canvas>'
  },
  Bar: {
    name: 'Bar',
    props: ['data', 'options'],
    template: '<canvas data-testid="bar-canvas"></canvas>'
  }
}))

// Mock chart.js
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale',
  PointElement: 'PointElement',
  LineElement: 'LineElement',
  BarElement: 'BarElement',
  BarController: 'BarController',
  Filler: 'Filler',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

// Use relative dates so time-window filtering never ages out of the 30-day window
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const MOCK_DATA = {
  fetchedAt: daysAgo(0),
  jiraHost: 'https://redhat.atlassian.net',
  metrics: {
    triageTotal: 10,
    triageVerdicts: { ready: 6, missingInfo: 2, notFixable: 1, stale: 1, pending: 0, external: 0, securityReview: 0 },
    autofixStates: { ready: 1, pending: 1, review: 1, ciFailing: 0, merged: 2, rejected: 0, maxRetries: 0, researched: 0, blocked: 1 },
    autofixTotal: 6,
    successRate: 100,
    windowTotal: 10,
    totalIssues: 10,
    eligibleCount: 1,
    eligibilityRate: 10
  },
  trendData: [
    { date: daysAgo(7).slice(0, 10), triaged: 3, autofixed: 2, merged: 1, total: 3, review: 1, ciFailing: 0, blocked: 0, maxRetries: 0, missingInfo: 1, stale: 0, external: 0, securityReview: 0 },
    { date: daysAgo(0).slice(0, 10), triaged: 7, autofixed: 4, merged: 1, total: 7, review: 1, ciFailing: 1, blocked: 0, maxRetries: 0, missingInfo: 1, stale: 1, external: 0, securityReview: 0 }
  ],
  componentBreakdown: [
    { component: 'Model Server', triaged: 5, autofixed: 3, done: 1 },
    { component: 'Notebooks', triaged: 3, autofixed: 1, done: 0 }
  ],
  issues: [
    {
      key: 'AIPCC-100',
      summary: 'Fix null pointer',
      status: 'In Progress',
      priority: 'Major',
      created: daysAgo(2),
      updated: daysAgo(1),
      labels: ['jira-autofix', 'jira-autofix-review'],
      components: ['Model Server'],
      assignee: 'Jane Doe',
      pipelineState: 'autofix-review'
    },
    {
      key: 'RHOAIENG-200',
      summary: 'Handle timeout',
      status: 'New',
      priority: 'Normal',
      created: daysAgo(3),
      updated: daysAgo(3),
      labels: ['jira-triage-not-fixable'],
      components: ['Notebooks'],
      assignee: null,
      pipelineState: 'triage-not-fixable'
    }
  ]
}

describe('AutofixContent', () => {
  it('renders summary stat cards with metric values', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).toContain('100%')
  })

  it('renders triage outcomes panel', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('Triage Outcomes')
    expect(wrapper.text()).toContain('Ready for AI')
    expect(wrapper.text()).toContain('Missing Info')
    expect(wrapper.text()).toContain('Not AI-Fixable')
  })

  it('renders autofix progress panel', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('Autofix Progress')
    expect(wrapper.text()).toContain('AI Fix Merged')
    expect(wrapper.text()).toContain('AI Fix Under Review')
  })

  it('does not render the removed Waiting on Humans: Autofix chart', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).not.toContain('Waiting on Humans: Autofix')
    expect(wrapper.text()).toContain('Waiting on Humans: Triage')
    expect(wrapper.text()).toContain('Adoption Over Time')
  })

  it('renders issue table with Jira links', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('AIPCC-100')
    expect(wrapper.text()).toContain('Fix null pointer')
    const link = wrapper.find('a[href*="browse/AIPCC-100"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://redhat.atlassian.net/browse/AIPCC-100')
  })

  it('shows empty state when no data', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: null, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('No autofix data yet')
  })

  it('shows error state', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: null, loading: false, error: 'Connection failed', timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('Failed to load data')
    expect(wrapper.text()).toContain('Connection failed')
  })

  function findIssueTableRows(wrapper) {
    const tables = wrapper.findAll('table')
    const issueTable = tables.find(t => {
      const th = t.findAll('th')
      return th.length > 0 && th[0].text() === 'Key'
    })
    return issueTable ? issueTable.findAll('tbody tr') : []
  }

  it('filters issues by search query', async () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    const input = wrapper.find('input[placeholder="Search issues..."]')
    await input.setValue('null pointer')
    const rows = findIssueTableRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('AIPCC-100')
  })

  it('renders new triage states in state filter dropdown', async () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    const stateBtn = wrapper.findAll('button').find(b => b.text().includes('All States'))
    await stateBtn.trigger('click')
    const labels = wrapper.findAll('label')
    const labelTexts = labels.map(l => l.text())
    expect(labelTexts).toContain('External Reporter')
    expect(labelTexts).toContain('Security Review')
  })

  it('filters issues by state', async () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    const stateBtn = wrapper.findAll('button').find(b => b.text().includes('All States'))
    await stateBtn.trigger('click')
    const notFixableLabel = wrapper.findAll('label').find(l => l.text().includes('Not AI-Fixable'))
    const checkbox = notFixableLabel.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    const rows = findIssueTableRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('RHOAIENG-200')
  })

  describe('eligibility rate calculation', () => {
    it('calculates eligibility from autofix-* pipeline state count / total issues', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-autofix-review'], pipelineState: 'autofix-review', components: [] },
          { key: 'TEST-3', created: daysAgo(3), labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable', components: [] },
          { key: 'TEST-4', created: daysAgo(4), labels: ['other-label'], pipelineState: 'unknown', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 4,
          eligibleCount: 2,
          eligibilityRate: 50
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('50%')
      expect(wrapper.text()).toContain('2 eligible of 4 total')
    })

    it('counts issues with autofix-* pipeline state as eligible', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged', 'other'], pipelineState: 'autofix-merged', components: [] },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-triage-stale'], pipelineState: 'triage-stale', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 2,
          eligibleCount: 1,
          eligibilityRate: 50
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('1 eligible of 2 total')
    })

    it('counts issues with autofix-* pipeline state regardless of labels', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-autofix'], pipelineState: 'autofix-ready', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 2,
          eligibleCount: 2,
          eligibilityRate: 100
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('2 eligible of 2 total')
    })

    it('shows 0% when window is empty', () => {
      const data = {
        ...MOCK_DATA,
        issues: [],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 0,
          eligibleCount: 0,
          eligibilityRate: 0
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('0%')
      expect(wrapper.text()).toContain('0 eligible of 0 total')
    })

    it('recomputes eligibility when filters are active', async () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { created: daysAgo(1), key: 'PROJ-1', labels: ['jira-autofix'], pipelineState: 'autofix-ready', components: [] },
          { created: daysAgo(2), key: 'PROJ-2', labels: ['jira-autofix', 'jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] },
          { created: daysAgo(3), key: 'PROJ-3', labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] },
          { created: daysAgo(4), key: 'OTHER-1', labels: ['jira-triage-stale'], pipelineState: 'triage-stale', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 4,
          eligibleCount: 2,
          eligibilityRate: 50,
          autofixStates: { ...MOCK_DATA.metrics.autofixStates, merged: 2 },
          successRate: 100
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })

      // With filters, client should recompute
      const projectSelect = wrapper.find('select')
      await projectSelect.setValue('PROJ')

      // After filtering to PROJ only:
      // - 3 total issues (PROJ-1, PROJ-2, PROJ-3)
      // - 3 eligible (all have autofix-* pipelineState: autofix-ready, autofix-merged, autofix-merged)
      // - 3/3 = 100%

      // Find the "Eligibility Rate" label and scope assertions to its containing card
      const eligibilityLabel = wrapper.findAll('div').find(div =>
        div.text() === 'Eligibility Rate' &&
        div.classes().includes('uppercase')
      )
      expect(eligibilityLabel).toBeDefined()

      // The card is the parent with class 'relative'
      const eligibilityCard = eligibilityLabel.element.closest('div.relative')
      expect(eligibilityCard).toBeTruthy()

      // Verify the card independently contains both the percentage and count
      const cardText = eligibilityCard.textContent
      expect(cardText).toContain('100%')
      expect(cardText).toContain('3 eligible of 3 total')
    })

    it('counts union of autofix-* state OR jira-autofix label', async () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          // Has jira-autofix label only (queued, not yet processed or human took over) - eligible
          { key: 'PROJ-1', created: daysAgo(1), labels: ['jira-autofix'], pipelineState: 'triage-pending', components: [] },
          // Has autofix-* state only (bot processing, label removed) - eligible
          { key: 'PROJ-2', created: daysAgo(2), labels: ['jira-autofix-ready'], pipelineState: 'autofix-ready', components: [] },
          // Has BOTH state and label - eligible
          { key: 'PROJ-3', created: daysAgo(3), labels: ['jira-autofix', 'jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] },
          // Has neither - not eligible
          { key: 'PROJ-4', created: daysAgo(4), labels: ['other'], pipelineState: 'triage-not-fixable', components: [] },
          // Other project issue - not in filter
          { key: 'OTHER-1', created: daysAgo(5), labels: ['jira-autofix'], pipelineState: 'autofix-ready', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 5,
          eligibleCount: 2,  // Deliberately wrong precomputed value
          eligibilityRate: 40  // Deliberately wrong precomputed rate
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })

      // Trigger filter to recompute metrics with union predicate
      const projectSelect = wrapper.find('select')
      await projectSelect.setValue('PROJ')

      // After filtering to PROJ only:
      // - 4 total issues (PROJ-1, PROJ-2, PROJ-3, PROJ-4)
      // - 3 eligible (PROJ-1 has label, PROJ-2 has state, PROJ-3 has both)
      // - 3/4 = 75%
      // Should NOT show precomputed 40% (2/5)
      expect(wrapper.text()).toContain('3 eligible of 4 total')
      expect(wrapper.text()).toContain('75%')
    })

    it('handles missing pipelineState when filter triggers metric recomputation', async () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          // Has jira-autofix label, missing pipelineState - eligible
          { created: daysAgo(1), key: 'PROJ-1', labels: ['jira-autofix'], pipelineState: null, components: [] },
          { created: daysAgo(2), key: 'PROJ-2', labels: ['jira-autofix'], pipelineState: undefined, components: [] },
          { created: daysAgo(3), key: 'PROJ-3', labels: ['jira-autofix'], components: [] },
          // No label, missing pipelineState - not eligible
          { created: daysAgo(4), key: 'PROJ-4', labels: ['other'], pipelineState: null, components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 4,
          eligibleCount: 3,
          eligibilityRate: 75
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })

      // Trigger filter to recompute metrics
      const projectSelect = wrapper.find('select')
      await projectSelect.setValue('PROJ')

      // Should not crash, should correctly count 3 eligible of 4 total
      expect(wrapper.text()).toContain('3 eligible of 4 total')
    })

    it('handles null pipelineState in trend data computation', async () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          // Has jira-autofix label, null pipelineState - should not crash when computing trends
          { created: daysAgo(1), key: 'PROJ-1', labels: ['jira-autofix'], pipelineState: null, components: [] },
          { created: daysAgo(2), key: 'PROJ-2', labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [] }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 2,
          eligibleCount: 2,
          eligibilityRate: 100
        },
        trendData: []
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })

      // Trigger filter to recompute trend data
      const projectSelect = wrapper.find('select')
      await projectSelect.setValue('PROJ')

      // Should not crash during trend data computation
      expect(wrapper.text()).toContain('2 eligible of 2 total')
    })

    it('does not change triage outcomes display', () => {
      const wrapper = mount(AutofixContent, { props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('Triage Outcomes')
      expect(wrapper.text()).toContain('Ready for AI')
    })

    it('does not change success rate display', () => {
      const wrapper = mount(AutofixContent, { props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('Success Rate')
      expect(wrapper.text()).toContain('100%')
    })
  })

  describe('bar Jira links match classified pipelineState', () => {
    const dualLabelData = {
      fetchedAt: daysAgo(0),
      jiraHost: 'https://redhat.atlassian.net',
      metrics: {
        triageTotal: 4,
        triageVerdicts: {
          ready: 2, missingInfo: 0, notFixable: 0, stale: 1, pending: 0,
          external: 0, securityReview: 1, humanAssigned: 0
        },
        autofixStates: {
          ready: 1, pending: 0, review: 0, ciFailing: 0, merged: 1,
          rejected: 0, maxRetries: 0, blocked: 0, forkUserMissing: 0
        },
        autofixTotal: 2,
        successRate: 100,
        windowTotal: 4,
        totalIssues: 4,
        eligibleCount: 2,
        eligibilityRate: 50
      },
      trendData: MOCK_DATA.trendData,
      issues: [
        { key: 'OSAC-READY', summary: 'queued', status: 'New', created: daysAgo(1), labels: ['jira-autofix'], components: [], pipelineState: 'autofix-ready' },
        { key: 'OSAC-MERGED', summary: 'merged', status: 'ON_QA', created: daysAgo(2), labels: ['jira-autofix-merged'], components: [], pipelineState: 'autofix-merged' },
        { key: 'OSAC-STALE', summary: 'stale but still jira-autofix', status: 'New', created: daysAgo(3), labels: ['jira-autofix', 'jira-triage-stale'], components: [], pipelineState: 'triage-stale' },
        { key: 'OSAC-SEC', summary: 'security but still jira-autofix', status: 'New', created: daysAgo(4), labels: ['jira-autofix', 'jira-triage-security-review'], components: [], pipelineState: 'triage-security-review' }
      ]
    }

    function jqlForSegment(wrapper, label) {
      const row = wrapper.findAll('[class*="space-y-2.5"] > div').find(r =>
        r.findAll('span').some(s => s.text() === label)
      )
      expect(row, `legend row for "${label}"`).toBeTruthy()
      return decodeURIComponent(row.find('a').attributes('href') || '')
    }

    it('Ready for AI opens key IN of autofix-* issues, not dual-labeled triage tickets', () => {
      const wrapper = mount(AutofixContent, {
        props: { autofixData: dualLabelData, loading: false, timeWindow: 'month' }
      })
      const jql = jqlForSegment(wrapper, 'Ready for AI')
      expect(jql).toContain('key IN (')
      expect(jql).toContain('"OSAC-READY"')
      expect(jql).toContain('"OSAC-MERGED"')
      expect(jql).not.toContain('"OSAC-STALE"')
      expect(jql).not.toContain('"OSAC-SEC"')
      expect(jql).not.toContain('labels IN')
    })

    it('Stale includes classified stale tickets that still have jira-autofix', () => {
      const wrapper = mount(AutofixContent, {
        props: { autofixData: dualLabelData, loading: false, timeWindow: 'month' }
      })
      const jql = jqlForSegment(wrapper, 'Stale')
      expect(jql).toContain('key IN ("OSAC-STALE")')
      expect(jql).not.toContain('labels NOT IN')
    })

    it('Security Review includes classified security tickets that still have jira-autofix', () => {
      const wrapper = mount(AutofixContent, {
        props: { autofixData: dualLabelData, loading: false, timeWindow: 'month' }
      })
      const jql = jqlForSegment(wrapper, 'Security Review')
      expect(jql).toContain('key IN ("OSAC-SEC")')
      expect(jql).not.toContain('labels NOT IN')
    })

    it('Queued for AI opens only autofix-ready keys, not stale or security-review', () => {
      const wrapper = mount(AutofixContent, {
        props: { autofixData: dualLabelData, loading: false, timeWindow: 'month' }
      })
      const jql = jqlForSegment(wrapper, 'Queued for AI')
      expect(jql).toContain('key IN ("OSAC-READY")')
      expect(jql).not.toContain('"OSAC-STALE"')
      expect(jql).not.toContain('"OSAC-SEC"')
      expect(jql).not.toContain('"OSAC-MERGED"')
      expect(jql).not.toContain('status = "New"')
    })
  })
})
