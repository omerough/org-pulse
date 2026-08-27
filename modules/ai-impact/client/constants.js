/**
 * Delivery pipeline phases — shared between views and detail panel components.
 */
export const PHASES = [
  { id: 'prd-review', name: 'PRD Review', order: 1, status: 'active' },
  { id: 'design-review', name: 'Design Review', order: 2, status: 'active' },
  { id: 'test-plan-review', name: 'Test Plan Review', order: 3, status: 'active' },
  { id: 'implementation', name: 'Implementation', order: 4, status: 'coming-soon' },
  { id: 'security', name: 'Security Review', order: 5, status: 'coming-soon' },
  { id: 'documentation', name: 'Documentation', order: 6, status: 'active' },
  { id: 'build-release', name: 'Build & Release', order: 7, status: 'active' },
  { id: 'jira-autofix', name: 'Jira Autofix', order: 8, status: 'active' },
]

/**
 * Fix version filter option values for Design Review. "All" and "Unassigned"
 * use their own `special:` tag so a real Jira fix version name (however it's
 * spelled) can never collide with them; real versions are tagged with
 * FIX_VERSION_OPTION_PREFIX and must be decoded before matching feature data.
 */
export const FIX_VERSION_FILTER_ALL = 'special:all'
export const FIX_VERSION_FILTER_UNASSIGNED = 'special:unassigned'
export const FIX_VERSION_OPTION_PREFIX = 'version:'

export function encodeFixVersionOption(version) {
  return `${FIX_VERSION_OPTION_PREFIX}${version}`
}

export function decodeFixVersionOption(optionValue) {
  return optionValue.slice(FIX_VERSION_OPTION_PREFIX.length)
}
