import { describe, it, expect, vi } from 'vitest'

const {
  classifyIssue,
  processIssue,
  extractTerminalAt,
  extractWasEligible,
  fetchFullChangelog,
  getLastWeekBounds,
  computeAutofixMetrics,
  buildTrendData
} = require('../../server/jira/autofix-fetcher')

describe('classifyIssue', () => {
  it('returns autofix-merged for jira-autofix-merged', () => {
    expect(classifyIssue(['jira-autofix-merged', 'jira-autofix'])).toBe('autofix-merged')
  })

  it('returns autofix-rejected for jira-autofix-rejected', () => {
    expect(classifyIssue(['jira-autofix-rejected'])).toBe('autofix-rejected')
  })

  it('returns autofix-max-retries for jira-autofix-max-retries', () => {
    expect(classifyIssue(['jira-autofix-max-retries'])).toBe('autofix-max-retries')
  })

  it('returns autofix-ci-failing for jira-autofix-ci-failing', () => {
    expect(classifyIssue(['jira-autofix-ci-failing'])).toBe('autofix-ci-failing')
  })

  it('returns autofix-review when jira-autofix-review is present', () => {
    expect(classifyIssue(['jira-autofix-review'])).toBe('autofix-review')
  })

  it('returns autofix-pending when jira-autofix-pending is present', () => {
    expect(classifyIssue(['jira-autofix-pending'])).toBe('autofix-pending')
  })

  it('returns autofix-blocked for jira-autofix-blocked', () => {
    expect(classifyIssue(['jira-autofix-blocked'])).toBe('autofix-blocked')
  })

  it('returns autofix-ready when jira-autofix is present and status is New', () => {
    expect(classifyIssue(['jira-autofix'], 'New')).toBe('autofix-ready')
  })

  it('returns unknown when jira-autofix is present but status is not New', () => {
    expect(classifyIssue(['jira-autofix'], 'In Progress')).toBe('unknown')
    expect(classifyIssue(['jira-autofix'])).toBe('unknown')
  })

  it('returns triage-not-fixable for jira-triage-not-fixable', () => {
    expect(classifyIssue(['jira-triage-not-fixable'])).toBe('triage-not-fixable')
  })

  it('returns triage-stale for jira-triage-stale', () => {
    expect(classifyIssue(['jira-triage-stale'])).toBe('triage-stale')
  })

  it('returns triage-missing-info for jira-triage-missing-info', () => {
    expect(classifyIssue(['jira-triage-missing-info'])).toBe('triage-missing-info')
  })

  it('returns triage-pending for jira-triage-pending', () => {
    expect(classifyIssue(['jira-triage-pending'])).toBe('triage-pending')
  })

  it('returns triage-external for jira-triage-external', () => {
    expect(classifyIssue(['jira-triage-external'])).toBe('triage-external')
  })

  it('returns triage-security-review for jira-triage-security-review', () => {
    expect(classifyIssue(['jira-triage-security-review'])).toBe('triage-security-review')
  })

  it('prioritizes triage-security-review over other triage states', () => {
    expect(classifyIssue(['jira-triage-not-fixable', 'jira-triage-security-review'])).toBe('triage-security-review')
  })

  it('returns unknown when no pipeline labels present', () => {
    expect(classifyIssue(['some-other-label'])).toBe('unknown')
  })

  it('prioritizes autofix-merged over other labels', () => {
    expect(classifyIssue(['jira-autofix-merged', 'jira-autofix-review', 'jira-autofix'])).toBe('autofix-merged')
  })

  it('prioritizes autofix-blocked over autofix-pending when both present', () => {
    expect(classifyIssue(['jira-autofix', 'jira-autofix-pending', 'jira-autofix-blocked'])).toBe('autofix-blocked')
  })
})

describe('processIssue', () => {
  it('extracts fields from a Jira issue', () => {
    const issue = {
      key: 'AIPCC-123',
      fields: {
        summary: 'Fix the thing',
        status: { name: 'In Progress' },
        priority: { name: 'Major' },
        created: '2026-04-16T10:00:00.000Z',
        updated: '2026-04-17T10:00:00.000Z',
        labels: ['jira-autofix-review'],
        components: [{ name: 'Model Server' }],
        assignee: { displayName: 'Jane Doe' }
      }
    }

    const result = processIssue(issue)
    expect(result.key).toBe('AIPCC-123')
    expect(result.summary).toBe('Fix the thing')
    expect(result.status).toBe('In Progress')
    expect(result.components).toEqual(['Model Server'])
    expect(result.assignee).toBe('Jane Doe')
    expect(result.pipelineState).toBe('autofix-review')
    expect(result.terminalAt).toBeNull()
    expect(result.wasEligible).toBeNull()
  })

  it('sets wasEligible true when labels include exact jira-autofix', () => {
    const issue = {
      key: 'AIPCC-200',
      fields: {
        summary: 'Eligible issue',
        status: { name: 'New' },
        priority: { name: 'Major' },
        created: '2026-04-16T10:00:00.000Z',
        updated: '2026-04-17T10:00:00.000Z',
        labels: ['jira-autofix'],
        components: [],
        assignee: null
      }
    }
    const result = processIssue(issue)
    expect(result.wasEligible).toBe(true)
  })

  it('handles missing optional fields', () => {
    const issue = {
      key: 'AIPCC-999',
      fields: {
        summary: 'Minimal issue',
        status: null,
        priority: null,
        created: '2026-04-16T10:00:00.000Z',
        updated: null,
        labels: ['jira-triage-pending'],
        components: [],
        assignee: null
      }
    }

    const result = processIssue(issue)
    expect(result.status).toBe('Unknown')
    expect(result.priority).toBe('None')
    expect(result.components).toEqual([])
    expect(result.assignee).toBeNull()
    expect(result.pipelineState).toBe('triage-pending')
    expect(result.wasEligible).toBeNull()
  })
})

describe('computeAutofixMetrics', () => {
  const now = new Date()
  const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const issues = [
    { created: recent, pipelineState: 'autofix-merged', components: ['A'] },
    { created: recent, pipelineState: 'autofix-review', components: ['A'] },
    { created: recent, pipelineState: 'autofix-rejected', components: ['A'] },
    { created: recent, pipelineState: 'triage-missing-info', components: ['B'] },
    { created: recent, pipelineState: 'triage-not-fixable', components: ['B'] },
    { created: recent, pipelineState: 'triage-external', components: ['B'] },
    { created: recent, pipelineState: 'triage-security-review', components: ['B'] },
    { created: old, pipelineState: 'autofix-merged', components: ['A'] }
  ]

  it('computes metrics for a week window', () => {
    const m = computeAutofixMetrics(issues, 'week')
    expect(m.windowTotal).toBe(7)
    expect(m.triageVerdicts.ready).toBe(3)
    expect(m.triageVerdicts.missingInfo).toBe(1)
    expect(m.triageVerdicts.notFixable).toBe(1)
    expect(m.triageVerdicts.external).toBe(1)
    expect(m.triageVerdicts.securityReview).toBe(1)
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.review).toBe(1)
    expect(m.autofixStates.rejected).toBe(1)
    expect(m.totalIssues).toBe(8)
  })

  it('computes success rate from terminal states (merged / (merged + rejected + maxRetries))', () => {
    const m = computeAutofixMetrics(issues, 'week')
    // merged=1, rejected=1, maxRetries=0 → terminal=2, successRate = 1/2 = 50%
    expect(m.successRate).toBe(50)
  })

  it('returns zero success rate when no terminal autofix issues in window', () => {
    const m = computeAutofixMetrics([], 'week')
    expect(m.successRate).toBe(0)
  })

  describe('eligibility rate', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

    it('counts issues with wasEligible true', () => {
      const issues = [
        { created: recent, wasEligible: true, pipelineState: 'autofix-merged' },
        { created: recent, wasEligible: true, pipelineState: 'autofix-review' },
        { created: recent, wasEligible: false, pipelineState: 'triage-not-fixable' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(2)
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(67)
    })

    it('does not count issues with wasEligible false', () => {
      const issues = [
        { created: recent, wasEligible: false, pipelineState: 'autofix-merged' },
        { created: recent, wasEligible: true, pipelineState: 'autofix-ready' },
        { created: recent, wasEligible: false, pipelineState: 'triage-pending' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(1)
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(33)
    })

    it('includes ineligible issues in denominator but not numerator', () => {
      const issues = [
        { created: recent, wasEligible: true, pipelineState: 'autofix-ready' },
        { created: recent, wasEligible: false, pipelineState: 'unknown' },
        { created: recent, wasEligible: false, pipelineState: 'triage-stale' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(1)
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(33)
    })

    it('returns 0% when window is empty', () => {
      const m = computeAutofixMetrics([], 'week')
      expect(m.eligibleCount).toBe(0)
      expect(m.windowTotal).toBe(0)
      expect(m.eligibilityRate).toBe(0)
    })

    it('returns 0% when no issues are eligible', () => {
      const issues = [
        { created: recent, wasEligible: false, pipelineState: 'triage-not-fixable' },
        { created: recent, wasEligible: false, pipelineState: 'unknown' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(0)
      expect(m.windowTotal).toBe(2)
      expect(m.eligibilityRate).toBe(0)
    })

    it('returns null eligibilityRate when any issue has wasEligible null', () => {
      const issues = [
        { created: recent, wasEligible: true, pipelineState: 'autofix-ready' },
        { created: recent, wasEligible: null, pipelineState: 'autofix-merged' },
        { created: recent, wasEligible: false, pipelineState: 'triage-stale' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBeNull()
      expect(m.eligibilityRate).toBeNull()
      expect(m.windowTotal).toBe(3)
    })

    it('returns null eligibilityRate when wasEligible is undefined', () => {
      const issues = [
        { created: recent, wasEligible: true, pipelineState: 'autofix-ready' },
        { created: recent, pipelineState: 'unknown' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBeNull()
      expect(m.eligibilityRate).toBeNull()
    })
  })

  describe('extractWasEligible', () => {
    it('returns true when changelog contains exact jira-autofix token', () => {
      const changelog = {
        histories: [{
          created: '2026-06-18T15:00:00.000+0000',
          items: [{ field: 'labels', toString: 'jira-autofix' }]
        }]
      }
      expect(extractWasEligible(changelog)).toBe(true)
    })

    it('returns true when jira-autofix appears among other labels', () => {
      const changelog = {
        histories: [{
          created: '2026-06-18T15:00:00.000+0000',
          items: [{ field: 'labels', toString: 'jira-autofix jira-autofix-merged other-label' }]
        }]
      }
      expect(extractWasEligible(changelog)).toBe(true)
    })

    it('returns false when only jira-autofix-merged is present (no exact match)', () => {
      const changelog = {
        histories: [{
          created: '2026-06-18T15:00:00.000+0000',
          items: [{ field: 'labels', toString: 'jira-autofix-merged' }]
        }]
      }
      expect(extractWasEligible(changelog)).toBe(false)
    })

    it('returns false when only jira-autofix-review is present', () => {
      const changelog = {
        histories: [{
          created: '2026-06-18T15:00:00.000+0000',
          items: [{ field: 'labels', toString: 'jira-autofix-review jira-autofix-ci-failing' }]
        }]
      }
      expect(extractWasEligible(changelog)).toBe(false)
    })

    it('returns false for null changelog', () => {
      expect(extractWasEligible(null)).toBe(false)
    })

    it('returns false for empty changelog', () => {
      expect(extractWasEligible({})).toBe(false)
      expect(extractWasEligible({ histories: [] })).toBe(false)
    })

    it('ignores non-label changelog entries', () => {
      const changelog = {
        histories: [{
          created: '2026-06-18T15:00:00.000+0000',
          items: [{ field: 'status', toString: 'jira-autofix' }]
        }]
      }
      expect(extractWasEligible(changelog)).toBe(false)
    })

    it('finds jira-autofix in earlier history entry', () => {
      const changelog = {
        histories: [
          {
            created: '2026-06-15T10:00:00.000+0000',
            items: [{ field: 'labels', toString: 'jira-autofix' }]
          },
          {
            created: '2026-06-18T15:00:00.000+0000',
            items: [{ field: 'labels', toString: 'jira-autofix-merged' }]
          }
        ]
      }
      expect(extractWasEligible(changelog)).toBe(true)
    })
  })

  describe('fetchFullChangelog', () => {
    it('fetches single page when total fits in one request', async () => {
      const entries = [
        { created: '2026-06-18T15:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-autofix' }] }
      ]
      const jiraRequest = vi.fn().mockResolvedValue({
        startAt: 0, maxResults: 100, total: 1, values: entries
      })
      const result = await fetchFullChangelog(jiraRequest, 'TEST-1')
      expect(result).toEqual({ histories: entries })
      expect(jiraRequest).toHaveBeenCalledTimes(1)
      expect(jiraRequest).toHaveBeenCalledWith(
        '/rest/api/3/issue/TEST-1/changelog?startAt=0&maxResults=100'
      )
    })

    it('paginates across multiple pages', async () => {
      const page1 = [{ created: '2026-06-01T10:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-triage-pending' }] }]
      const page2 = [{ created: '2026-06-10T10:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-autofix' }] }]
      const jiraRequest = vi.fn()
        .mockResolvedValueOnce({ startAt: 0, maxResults: 1, total: 2, values: page1 })
        .mockResolvedValueOnce({ startAt: 1, maxResults: 1, total: 2, values: page2 })
      const result = await fetchFullChangelog(jiraRequest, 'TEST-2')
      expect(result).toEqual({ histories: [...page1, ...page2] })
      expect(jiraRequest).toHaveBeenCalledTimes(2)
      expect(jiraRequest).toHaveBeenNthCalledWith(1,
        '/rest/api/3/issue/TEST-2/changelog?startAt=0&maxResults=100'
      )
      expect(jiraRequest).toHaveBeenNthCalledWith(2,
        '/rest/api/3/issue/TEST-2/changelog?startAt=1&maxResults=100'
      )
    })

    it('jira-autofix on second page produces wasEligible true', async () => {
      const page1 = [{ created: '2026-06-01T10:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-triage-pending' }] }]
      const page2 = [{ created: '2026-06-10T10:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-autofix' }] }]
      const jiraRequest = vi.fn()
        .mockResolvedValueOnce({ startAt: 0, maxResults: 1, total: 2, values: page1 })
        .mockResolvedValueOnce({ startAt: 1, maxResults: 1, total: 2, values: page2 })
      const changelog = await fetchFullChangelog(jiraRequest, 'TEST-5')
      expect(extractWasEligible(changelog)).toBe(true)
    })

    it('returns null when pagination stalls (empty page but total not reached)', async () => {
      const page1 = [{ created: '2026-06-01T10:00:00.000+0000', items: [{ field: 'labels', toString: 'jira-triage-pending' }] }]
      const jiraRequest = vi.fn()
        .mockResolvedValueOnce({ startAt: 0, maxResults: 1, total: 3, values: page1 })
        .mockResolvedValueOnce({ startAt: 1, maxResults: 1, total: 3, values: [] })
      const result = await fetchFullChangelog(jiraRequest, 'TEST-6')
      expect(result).toBeNull()
    })

    it('returns empty histories for issue with no changelog', async () => {
      const jiraRequest = vi.fn().mockResolvedValue({
        startAt: 0, maxResults: 100, total: 0, values: []
      })
      const result = await fetchFullChangelog(jiraRequest, 'TEST-7')
      expect(result).toEqual({ histories: [] })
    })

    it('returns null when API returns unexpected shape', async () => {
      const jiraRequest = vi.fn().mockResolvedValue({ error: 'not found' })
      const result = await fetchFullChangelog(jiraRequest, 'TEST-3')
      expect(result).toBeNull()
    })

    it('returns null when API throws', async () => {
      const jiraRequest = vi.fn().mockRejectedValue(new Error('network error'))
      await expect(fetchFullChangelog(jiraRequest, 'TEST-4')).rejects.toThrow('network error')
    })

    it('encodes special characters in issue key', async () => {
      const jiraRequest = vi.fn().mockResolvedValue({
        startAt: 0, maxResults: 100, total: 0, values: []
      })
      await fetchFullChangelog(jiraRequest, 'PROJ/KEY-1')
      expect(jiraRequest).toHaveBeenCalledWith(
        '/rest/api/3/issue/PROJ%2FKEY-1/changelog?startAt=0&maxResults=100'
      )
    })
  })

  it('does not change triage outcomes calculation', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, wasEligible: true, pipelineState: 'autofix-merged' },
      { created: recent, wasEligible: false, pipelineState: 'triage-not-fixable' },
      { created: recent, wasEligible: false, pipelineState: 'triage-stale' }
    ]
    const m = computeAutofixMetrics(issues, 'week')
    expect(m.triageVerdicts.ready).toBe(1)
    expect(m.triageVerdicts.notFixable).toBe(1)
    expect(m.triageVerdicts.stale).toBe(1)
    expect(m.triageTotal).toBe(3)
  })

  it('does not change success rate calculation', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, wasEligible: true, pipelineState: 'autofix-merged' },
      { created: recent, wasEligible: true, pipelineState: 'autofix-rejected' },
      { created: recent, wasEligible: true, pipelineState: 'autofix-max-retries' }
    ]
    const m = computeAutofixMetrics(issues, 'week')
    expect(m.successRate).toBe(33)
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.rejected).toBe(1)
    expect(m.autofixStates.maxRetries).toBe(1)
  })
})

describe('buildTrendData', () => {
  it('returns weekly data points with breakdown fields', () => {
    const issues = [
      { created: new Date().toISOString(), pipelineState: 'autofix-merged', components: [] }
    ]
    const trend = buildTrendData(issues, 'week')
    expect(trend).toHaveLength(4)
    expect(trend[0]).toHaveProperty('date')
    expect(trend[0]).toHaveProperty('triaged')
    expect(trend[0]).toHaveProperty('autofixed')
    expect(trend[0]).toHaveProperty('merged')
    expect(trend[0]).toHaveProperty('review')
    expect(trend[0]).toHaveProperty('ciFailing')
    expect(trend[0]).toHaveProperty('blocked')
    expect(trend[0]).toHaveProperty('maxRetries')
    expect(trend[0]).toHaveProperty('missingInfo')
    expect(trend[0]).toHaveProperty('stale')
    expect(trend[0]).toHaveProperty('external')
    expect(trend[0]).toHaveProperty('securityReview')
  })

  it('returns 13 points for 3months window', () => {
    const trend = buildTrendData([], '3months')
    expect(trend).toHaveLength(13)
  })

  it('counts waiting-on-humans breakdowns correctly', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, pipelineState: 'autofix-review', components: [] },
      { created: recent, pipelineState: 'autofix-review', components: [] },
      { created: recent, pipelineState: 'autofix-ci-failing', components: [] },
      { created: recent, pipelineState: 'autofix-blocked', components: [] },
      { created: recent, pipelineState: 'autofix-max-retries', components: [] },
      { created: recent, pipelineState: 'autofix-merged', components: [] },
      { created: recent, pipelineState: 'triage-missing-info', components: [] },
      { created: recent, pipelineState: 'triage-stale', components: [] },
      { created: recent, pipelineState: 'triage-external', components: [] },
      { created: recent, pipelineState: 'triage-security-review', components: [] }
    ]
    const trend = buildTrendData(issues, 'week')
    const lastPoint = trend[trend.length - 1]
    expect(lastPoint.review).toBe(2)
    expect(lastPoint.ciFailing).toBe(1)
    expect(lastPoint.blocked).toBe(1)
    expect(lastPoint.maxRetries).toBe(1)
    expect(lastPoint.merged).toBe(1)
    expect(lastPoint.missingInfo).toBe(1)
    expect(lastPoint.stale).toBe(1)
    expect(lastPoint.external).toBe(1)
    expect(lastPoint.securityReview).toBe(1)
  })

  it('returns 4 points for lastWeek window', () => {
    const trend = buildTrendData([], 'lastWeek')
    expect(trend).toHaveLength(4)
  })

  it('uses terminalAt for merged issues in lastWeek window', () => {
    const { start, end } = getLastWeekBounds()
    const midLastWeek = new Date(start + (end - start) / 2).toISOString()
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: threeMonthsAgo, terminalAt: midLastWeek, pipelineState: 'autofix-merged' },
      { created: midLastWeek, terminalAt: null, pipelineState: 'autofix-review' }
    ]
    const trend = buildTrendData(issues, 'lastWeek')
    const lastBucket = trend[trend.length - 1]
    expect(lastBucket.merged).toBe(1)
    expect(lastBucket.review).toBe(1)
  })

  it('does not use terminalAt for existing time windows', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: old, terminalAt: recent, pipelineState: 'autofix-merged' }
    ]
    const trend = buildTrendData(issues, 'week')
    const lastBucket = trend[trend.length - 1]
    expect(lastBucket.merged).toBe(0)
  })
})

describe('extractTerminalAt', () => {
  it('returns timestamp when terminal label appears in changelog', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBe('2026-06-18T15:11:11.202Z')
  })

  it('returns the latest timestamp when label was added multiple times', () => {
    const changelog = {
      histories: [
        {
          created: '2026-04-21T17:30:05.162+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        },
        {
          created: '2026-06-11T15:05:41.099+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBe('2026-06-11T15:05:41.099Z')
  })

  it('returns null when label is not found in changelog', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-review' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBeNull()
  })

  it('returns null for empty changelog', () => {
    expect(extractTerminalAt(null, 'autofix-merged')).toBeNull()
    expect(extractTerminalAt({}, 'autofix-merged')).toBeNull()
  })

  it('ignores non-label changelog entries', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'status', toString: 'Closed' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBeNull()
  })
})

describe('computeAutofixMetrics with lastWeek', () => {
  it('uses terminalAt for terminal issues in lastWeek window', () => {
    const { start, end } = getLastWeekBounds()
    const midLastWeek = new Date(start + (end - start) / 2).toISOString()
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: threeMonthsAgo, terminalAt: midLastWeek, pipelineState: 'autofix-merged' },
      { created: midLastWeek, terminalAt: null, pipelineState: 'autofix-review' },
      { created: threeMonthsAgo, terminalAt: null, pipelineState: 'autofix-merged' }
    ]
    const m = computeAutofixMetrics(issues, 'lastWeek')
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.review).toBe(1)
    expect(m.windowTotal).toBe(2)
  })

  it('does not include terminal issues outside lastWeek window', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: twoWeeksAgo, terminalAt: twoWeeksAgo, pipelineState: 'autofix-merged' }
    ]
    const m = computeAutofixMetrics(issues, 'lastWeek')
    expect(m.autofixStates.merged).toBe(0)
  })
})

describe('getLastWeekBounds', () => {
  it('returns Monday-to-Monday boundaries', () => {
    const { start, end } = getLastWeekBounds()
    const startDate = new Date(start)
    const endDate = new Date(end)
    expect(startDate.getUTCDay()).toBe(1)
    expect(endDate.getUTCDay()).toBe(1)
    expect(end - start).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('end is before now', () => {
    const { end } = getLastWeekBounds()
    expect(end).toBeLessThanOrEqual(Date.now())
  })
})
