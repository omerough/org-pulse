import { describe, it, expect } from 'vitest'
import { preparationHelpText, readinessMeta, designEvidenceSummary } from '../../../client/execute/utils/readiness'

describe('preparationHelpText', () => {
  it('uses OSAC-specific PRD/Design wording for OSAC feature keys', () => {
    expect(preparationHelpText('ready', 'OSAC-1862')).toContain('Required PRD and Design pull requests have been merged.')
    expect(preparationHelpText('pending', 'OSAC-1862')).toContain('Required PRD or Design work is still pending completion and PR merge.')
    expect(preparationHelpText('unknown', 'OSAC-1862')).toContain('Not enough information to confirm whether the required PRD and Design pull requests have been merged.')
  })

  it('falls back to generic wording for non-OSAC feature keys, never asserting OSAC policy', () => {
    const text = preparationHelpText('ready', 'RHOAIENG-500')
    expect(text).not.toContain('PRD')
    expect(text).toContain('Required planning is confirmed complete.')
  })

  it('falls back to generic wording when the feature key is missing', () => {
    const text = preparationHelpText('pending', undefined)
    expect(text).not.toContain('PRD')
    expect(text).toContain('Required planning is still pending.')
  })

  it('returns null for not-applicable regardless of project', () => {
    expect(preparationHelpText('not-applicable', 'OSAC-1862')).toBeNull()
  })
})

describe('evidence-driven readiness wording', () => {
  const design = { requiredStatusFields: ['designPrStatus'], lookup: 'complete' }

  it('describes a Design-only requirement from the published required fields', () => {
    expect(preparationHelpText('ready', 'EDM-1', design)).toContain('Required Design pull request has been merged.')
    expect(preparationHelpText('pending', 'EDM-1', design)).toContain('Required Design pull request has not been merged yet.')
    expect(preparationHelpText('unknown', 'EDM-1', design)).toContain('No verified Design pull request was found')
  })

  it('says evidence is unavailable instead of claiming a PR is missing when the lookup failed', () => {
    const text = preparationHelpText('unknown', 'EDM-1', { ...design, lookup: 'unavailable' })
    expect(text).toContain('evidence is currently unavailable')
    expect(text).not.toContain('No verified')
  })

  it('keeps OSAC wording for rows without published evidence', () => {
    expect(preparationHelpText('ready', 'OSAC-1', null)).toContain('Required PRD and Design pull requests have been merged.')
    expect(readinessMeta('ready', 'OSAC-1').help).toContain('PRD and Design')
  })

  it('falls back to generic wording when published required fields are unrecognized', () => {
    expect(preparationHelpText('ready', 'EDM-1', { requiredStatusFields: ['mystery'] }))
      .toContain('Required planning is confirmed complete.')
  })

  it('maps unrecognized readiness values to Unknown', () => {
    expect(readinessMeta('bogus', 'EDM-1', design).label).toBe('Unknown')
  })
})

describe('designEvidenceSummary', () => {
  const pr = (number, status, extra = {}) => ({
    number, status, url: `https://github.com/flightctl/design-docs/pull/${number}`, draft: false,
    reviewStatus: null, createdAt: '2026-05-01T00:00:00Z', mergedAt: null, ...extra
  })

  it('returns null for rows without published evidence', () => {
    expect(designEvidenceSummary(undefined)).toBeNull()
    expect(designEvidenceSummary(null)).toBeNull()
  })

  it('distinguishes approved-but-unmerged from awaiting review, draft, and closed', () => {
    const label = p => designEvidenceSummary({ designPr: p, designPrs: [p] }).primary.status
    expect(label(pr(1, 'Open', { reviewStatus: 'APPROVED' }))).toBe('Open, approved — not yet merged')
    expect(label(pr(2, 'Open', { reviewStatus: 'AWAITING_REVIEW' }))).toBe('Open, awaiting review')
    expect(label(pr(3, 'Open', { draft: true }))).toBe('Open (draft)')
    expect(label(pr(4, 'Open', { reviewStatus: 'CHANGES_REQUESTED' }))).toBe('Open, changes requested')
    expect(label(pr(5, 'Closed'))).toBe('Closed without merging')
    expect(label(pr(6, 'Merged', { mergedAt: '2026-05-20T00:00:00Z' }))).toBe('Merged')
  })

  it('lists the other matched Design PRs separately from the governing one', () => {
    const merged = pr(1, 'Merged', { mergedAt: '2026-05-20T00:00:00Z' })
    const summary = designEvidenceSummary({ designPr: merged, designPrs: [merged, pr(2, 'Open'), pr(3, 'Closed')] })
    expect(summary.primary.number).toBe(1)
    expect(summary.primary.mergedAt).toBe('2026-05-20T00:00:00Z')
    expect(summary.others.map(p => [p.number, p.status])).toEqual([[2, 'Open, awaiting review'], [3, 'Closed without merging']])
  })

  it('only links github.com pull requests', () => {
    const summary = designEvidenceSummary({ designPr: pr(1, 'Open', { url: 'javascript:alert(1)' }), designPrs: [] })
    expect(summary.primary.url).toBeNull()
  })

  it('reports approval timing only when a release start is known', () => {
    const merged = pr(1, 'Merged', { mergedAt: '2026-06-02T00:00:00Z' })
    const withTiming = timing => designEvidenceSummary({ designPr: merged, designPrs: [merged], approvalTiming: timing })
    expect(withTiming({ state: 'late', releaseStart: '2026-06-01' }).timingNote).toContain('after the release cycle started (2026-06-01)')
    expect(withTiming({ state: 'on-time', releaseStart: '2026-06-01' }).timingNote).toContain('before the release cycle started')
    expect(withTiming({ state: 'unknown', reason: 'release-start-unknown' }).timingNote).toBeNull()
    expect(withTiming(null).timingNote).toBeNull()
  })

  it('flags an unavailable lookup and shows no PR', () => {
    const summary = designEvidenceSummary({ lookup: 'unavailable', designPr: null, designPrs: [] })
    expect(summary.lookupUnavailable).toBe(true)
    expect(summary.primary).toBeNull()
  })
})
