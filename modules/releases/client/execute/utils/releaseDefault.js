const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// Bare YYYY-MM-DD values are local calendar days; `new Date('YYYY-MM-DD')` is UTC
// midnight and lands on the previous day west of UTC.
export function parseGaDate(value) {
  const match = typeof value === 'string' ? BARE_DATE.exec(value) : null
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date
}

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function firstAvailableVersion(release, availableVersions) {
  return (release.fixVersions || []).find(version => availableVersions.includes(version)) || null
}

/** Nearest GA not yet passed (GA day included), else latest past GA; `version: null` when nothing matches. */
export function pickDefaultRelease({ registryReleases, availableVersions, today }) {
  if (!Array.isArray(registryReleases) || registryReleases.length === 0) {
    return { version: null, reason: 'no-registry' }
  }
  const startOfToday = localMidnight(today)

  const candidates = []
  for (const release of registryReleases) {
    const ga = release?.state === 'active' ? parseGaDate(release.milestones?.ga) : null
    const version = ga ? firstAvailableVersion(release, availableVersions || []) : null
    if (version) candidates.push({ id: String(release.id ?? ''), ga, version })
  }
  if (candidates.length === 0) return { version: null, reason: 'no-match' }

  const byId = (a, b) => a.id.localeCompare(b.id)
  const upcoming = candidates
    .filter(candidate => candidate.ga >= startOfToday)
    .sort((a, b) => a.ga - b.ga || byId(a, b))
  if (upcoming.length > 0) return { version: upcoming[0].version, reason: 'next-ga' }

  const past = candidates.sort((a, b) => b.ga - a.ga || byId(a, b))
  return { version: past[0].version, reason: 'latest-ga' }
}

function formatGa(ga) {
  return ga.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Selector entries for every available version; registry display names where mapped. */
export function buildReleaseOptions({ availableVersions, registryReleases, defaultPick }) {
  const releaseByVersion = new Map()
  for (const release of registryReleases || []) {
    if (release?.state !== 'active') continue
    for (const version of release.fixVersions || []) {
      if (!releaseByVersion.has(version)) releaseByVersion.set(version, release)
    }
  }

  return (availableVersions || []).map(version => {
    const release = releaseByVersion.get(version)
    const ga = release ? parseGaDate(release.milestones?.ga) : null
    const name = release ? (release.displayName || release.id) : version
    const parts = [name]
    if (ga) parts.push(`GA ${formatGa(ga)}`)
    if (defaultPick?.version === version) parts.push(defaultPick.reason === 'next-ga' ? 'Next GA' : 'Latest GA')
    return { value: version, label: parts.join(' · ') }
  })
}
