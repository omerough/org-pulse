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
 * Sentinel values for the Design Review fix version filter — distinct from
 * any real Jira fix version name to avoid collision.
 */
export const FIX_VERSION_FILTER_ALL = '__all__'
export const FIX_VERSION_FILTER_UNASSIGNED = '__unassigned__'
