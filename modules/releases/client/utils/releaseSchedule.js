const RC_SUFFIX = /(?:^|[-._\s])rc[-._]?\d*$/i
const VERSION_PATTERN = /^(?:[a-z]+[-_ ])?v?(\d+(?:\.(?:\d+|z))*)(.*)$/i

function versionName(release) {
  return (release.fixVersions && release.fixVersions[0]) || release.displayName || release.id || ''
}

function gaDate(release) {
  const ga = release.milestones && release.milestones.ga
  return typeof ga === 'string' ? ga.slice(0, 10) : ''
}

/** `.z` is the z-stream placeholder (e.g. 4.21.z) and sorts above every numbered z release. */
function parseVersion(name) {
  const match = VERSION_PATTERN.exec(name.trim())
  if (!match) return null
  return {
    parts: match[1].split('.').map(part => (part.toLowerCase() === 'z' ? Infinity : Number(part))),
    suffix: match[2].trim()
  }
}

export function isReleaseCandidate(release) {
  return RC_SUFFIX.test(versionName(release).trim())
}

function compareVersionsDesc(a, b) {
  const length = Math.max(a.parts.length, b.parts.length)
  for (let i = 0; i < length; i++) {
    const x = a.parts[i] === undefined ? 0 : a.parts[i]
    const y = b.parts[i] === undefined ? 0 : b.parts[i]
    if (x !== y) return x > y ? -1 : 1
  }
  // A pre-release suffix (e.g. "-beta") sorts below the plain version.
  if (!a.suffix !== !b.suffix) return a.suffix ? 1 : -1
  return b.suffix.localeCompare(a.suffix)
}

/**
 * Newest-first within one product: version family first so undated future
 * versions stay above older ones, then GA date. Names that carry no version
 * number sort after versioned ones, dated before undated.
 */
export function compareReleasesNewestFirst(a, b) {
  const nameA = versionName(a)
  const nameB = versionName(b)
  const versionA = parseVersion(nameA)
  const versionB = parseVersion(nameB)
  if (versionA && versionB) {
    const byVersion = compareVersionsDesc(versionA, versionB)
    if (byVersion !== 0) return byVersion
  } else if (versionA || versionB) {
    return versionA ? -1 : 1
  }
  const dateA = gaDate(a)
  const dateB = gaDate(b)
  if (dateA !== dateB) {
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA > dateB ? -1 : 1
  }
  return nameA.localeCompare(nameB)
}

export const STATUS_LABELS = Object.freeze({
  released: 'Released',
  'in-progress': 'In progress',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
  unreleased: 'Unreleased'
})

/**
 * Release status for display. `confirmed` is true only when Jira's own
 * `released` flag says so; a published `lifecycle` is derived from dates and is
 * inferred. Entries that carry neither (e.g. Product Pages) have no status.
 */
export function releaseStatus(release) {
  const released = release.sourceFields && release.sourceFields.released
  if (released === true) return { key: 'released', confirmed: true }
  if (release.lifecycle) return { key: release.lifecycle, confirmed: false }
  if (released === false) return { key: 'unreleased', confirmed: true }
  return null
}

/** Jira version page published by the registry; only https links are rendered. */
export function releaseJiraUrl(release) {
  const url = release.jiraUrl
  if (typeof url !== 'string') return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
