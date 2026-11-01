const OSAC_EXCLUDED_LABELS = ['no-ui', 'ui-enclave-only']
const OSAC_CONNECTIVITY_COMPONENT = 'Connectivity&Fabric'

function panel(component, { excludedLabels = OSAC_EXCLUDED_LABELS, notInComponents = [] } = {}) {
  return { id: component, component, excludedLabels, notInComponents }
}

// Panels follow the saved Jira filters: only Enclave shows `ui-enclave-only` Epics, and
// CaaS/BMaaS/VMaaS leave Connectivity&Fabric Epics to their own panel.
const OSAC_COMPONENT_DASHBOARD = {
  jiraProjectKey: 'OSAC',
  scopeLabel: 'bootstrap',
  scopeDescription: 'Bootstrap Epics only (label bootstrap). Epics labelled no-ui are excluded, and ui-enclave-only Epics appear only under Enclave.',
  panels: [
    panel('Enclave', { excludedLabels: ['no-ui'] }),
    panel('CaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('BMaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('VMaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('Core'),
    panel(OSAC_CONNECTIVITY_COMPONENT),
    panel('Metering, Billing and Quota'),
    panel('Storage'),
    panel('Observability')
  ],
  // Highest first, mirroring the saved filters' `ORDER BY status DESC, priority DESC`.
  statusRank: ['Closed', 'In Progress', 'Backlog', 'New'],
  priorityRank: ['Blocker', 'Critical', 'Major', 'Normal', 'Minor', 'Undefined']
}

const COMPONENT_DASHBOARD_BY_PROJECT_ID = {
  osac: OSAC_COMPONENT_DASHBOARD
}

// The shell leaves projectId empty only when OSAC is the sole published project.
const SINGLE_PROJECT_DEFAULT_ID = 'osac'

export function resolveComponentDashboard(projectId) {
  const effectiveProjectId = projectId || SINGLE_PROJECT_DEFAULT_ID
  if (!Object.hasOwn(COMPONENT_DASHBOARD_BY_PROJECT_ID, effectiveProjectId)) return null
  return { projectId: effectiveProjectId, config: COMPONENT_DASHBOARD_BY_PROJECT_ID[effectiveProjectId] }
}
