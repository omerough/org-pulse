const GENERIC_PREPARATION_HELP = {
  ready: 'Required planning is confirmed complete.',
  pending: 'Required planning is still pending.',
  unknown: 'There isn’t enough information to determine planning readiness.'
}

// OSAC-specific policy wording; other projects get the generic text instead.
const OSAC_PROJECT_KEY = 'OSAC'
const OSAC_PREPARATION_HELP = {
  ready: 'Required PRD and Design pull requests have been merged.',
  pending: 'Required PRD or Design work is still pending completion and PR merge.',
  unknown: 'Not enough information to confirm whether the required PRD and Design pull requests have been merged.'
}

const REQUIRED_FIELD_NAMES = { prdPrStatus: 'PRD', designPrStatus: 'Design' }

export const READINESS_META = {
  ready: { label: 'Ready', class: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30' },
  pending: { label: 'Pending', class: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30' },
  unknown: { label: 'Unknown', class: 'bg-gray-100 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-500/30' },
  'not-applicable': { label: 'N/A', class: 'bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700' }
}

export function projectKeyOf(featureKey) {
  const idx = typeof featureKey === 'string' ? featureKey.indexOf('-') : -1
  return idx > 0 ? featureKey.slice(0, idx) : null
}

// Wording for a project whose rows publish `readinessEvidence`; null when the
// published required fields are not recognized.
function evidencePreparationHelp(readiness, evidence) {
  const names = (evidence.requiredStatusFields || []).map(field => REQUIRED_FIELD_NAMES[field])
  if (!names.length || names.some(name => !name)) return null
  const subject = names.join(' and ')
  const noun = names.length === 1 ? 'pull request' : 'pull requests'
  const verb = names.length === 1 ? 'has' : 'have'
  if (readiness === 'ready') return `Required ${subject} ${noun} ${verb} been merged.`
  if (readiness === 'pending') return `Required ${subject} ${noun} ${verb} not been merged yet.`
  if (readiness === 'unknown') {
    return evidence.lookup === 'unavailable'
      ? `${subject} ${noun} evidence is currently unavailable, so planning readiness can’t be determined.`
      : `No verified ${subject} ${noun} was found, so planning readiness is unknown.`
  }
  return null
}

// not-applicable has no defined help text.
export function preparationHelpText(readiness, featureKey, evidence = null) {
  const fromEvidence = evidence ? evidencePreparationHelp(readiness, evidence) : null
  const table = projectKeyOf(featureKey) === OSAC_PROJECT_KEY ? OSAC_PREPARATION_HELP : GENERIC_PREPARATION_HELP
  const base = fromEvidence || table[readiness]
  return base ? base + ' Planning is separate from execution progress.' : null
}

export function readinessMeta(readiness, featureKey, evidence = null) {
  const key = READINESS_META[readiness] ? readiness : 'unknown'
  return { ...READINESS_META[key], help: preparationHelpText(key, featureKey, evidence) }
}

function safeGithubUrl(url) {
  return typeof url === 'string' && url.startsWith('https://github.com/') ? url : null
}

function prStatusLabel(pr) {
  if (pr.status === 'Merged') return 'Merged'
  if (pr.status === 'Closed') return 'Closed without merging'
  if (pr.status !== 'Open') return null
  if (pr.draft) return 'Open (draft)'
  if (pr.reviewStatus === 'APPROVED') return 'Open, approved — not yet merged'
  if (pr.reviewStatus === 'CHANGES_REQUESTED') return 'Open, changes requested'
  return 'Open, awaiting review'
}

function describePr(pr) {
  const status = prStatusLabel(pr)
  if (!status || !Number.isInteger(pr.number)) return null
  return {
    number: pr.number,
    url: safeGithubUrl(pr.url),
    status,
    createdAt: pr.createdAt || null,
    mergedAt: pr.status === 'Merged' ? pr.mergedAt || null : null
  }
}

// Design PR evidence for Feature Detail; null for rows without published readiness evidence (e.g. OSAC).
export function designEvidenceSummary(evidence) {
  if (!evidence || typeof evidence !== 'object') return null
  const primary = evidence.designPr ? describePr(evidence.designPr) : null
  const primaryNumber = primary ? primary.number : null
  const others = (Array.isArray(evidence.designPrs) ? evidence.designPrs : [])
    .filter(pr => pr && pr.number !== primaryNumber)
    .map(describePr)
    .filter(Boolean)
  const timing = evidence.approvalTiming
  let timingNote = null
  if (primary && timing && timing.releaseStart) {
    if (timing.state === 'late') timingNote = `Merged after the release cycle started (${timing.releaseStart}). Informational only.`
    if (timing.state === 'on-time') timingNote = `Merged before the release cycle started (${timing.releaseStart}).`
  }
  return {
    lookupUnavailable: evidence.lookup === 'unavailable',
    primary,
    others,
    timingNote
  }
}
