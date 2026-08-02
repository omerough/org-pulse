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
      pipelineState: 'autofix-review',
      wasEligible: true
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
      pipelineState: 'triage-not-fixable',
      wasEligible: false
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

  it('renders issue table with Jira links', () => {
    const wrapper = mount(AutofixContent, {
      props: { autofixData: MOCK_DATA, loading: false, timeWindow: 'month' }
    })
    expect(wrapper.text()).toContain('AIPCC-100')
    expect(wrapper.text()).toContain('Fix null pointer')
    const link = wrapper.find('a[href*="AIPCC-100"]')
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
    it('displays eligibility from wasEligible field', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [], wasEligible: true },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-autofix-review'], pipelineState: 'autofix-review', components: [], wasEligible: true },
          { key: 'TEST-3', created: daysAgo(3), labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable', components: [], wasEligible: false },
          { key: 'TEST-4', created: daysAgo(4), labels: ['other-label'], pipelineState: 'unknown', components: [], wasEligible: false }
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

    it('counts wasEligible true even when current label is removed', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [], wasEligible: true },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-triage-stale'], pipelineState: 'triage-stale', components: [], wasEligible: false }
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

    it('shows unavailable when any issue has wasEligible null', () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { key: 'TEST-1', created: daysAgo(1), labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [], wasEligible: true },
          { key: 'TEST-2', created: daysAgo(2), labels: ['jira-triage-stale'], pipelineState: 'triage-stale', components: [], wasEligible: null }
        ],
        metrics: {
          ...MOCK_DATA.metrics,
          windowTotal: 2,
          eligibleCount: null,
          eligibilityRate: null
        }
      }
      const wrapper = mount(AutofixContent, { props: { autofixData: data, loading: false, timeWindow: 'month' } })
      expect(wrapper.text()).toContain('--')
      expect(wrapper.text()).toContain('Unavailable')
    })

    it('recomputes eligibility when filters are active', async () => {
      const data = {
        ...MOCK_DATA,
        issues: [
          { created: daysAgo(1), key: 'PROJ-1', labels: ['jira-autofix'], pipelineState: 'autofix-ready', components: [], wasEligible: true },
          { created: daysAgo(2), key: 'PROJ-2', labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [], wasEligible: true },
          { created: daysAgo(3), key: 'PROJ-3', labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged', components: [], wasEligible: false },
          { created: daysAgo(4), key: 'OTHER-1', labels: ['jira-triage-stale'], pipelineState: 'triage-stale', components: [], wasEligible: false }
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

      const projectSelect = wrapper.find('select')
      await projectSelect.setValue('PROJ')

      // After filtering to PROJ only:
      // - 3 total (PROJ-1, PROJ-2, PROJ-3)
      // - 2 eligible (PROJ-1, PROJ-2 have wasEligible: true)
      // - PROJ-3 has wasEligible: false (jira-autofix-merged added independently)
      // - 2/3 = 67% (different from 100% Success Rate)
      const eligibilityLabel = wrapper.findAll('div').find(div =>
        div.text() === 'Eligibility Rate' &&
        div.classes().includes('uppercase')
      )
      expect(eligibilityLabel).toBeDefined()

      const eligibilityCard = eligibilityLabel.element.closest('div.relative')
      expect(eligibilityCard).toBeTruthy()

      const cardText = eligibilityCard.textContent
      expect(cardText).toContain('67%')
      expect(cardText).toContain('2 eligible of 3 total')
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
})
