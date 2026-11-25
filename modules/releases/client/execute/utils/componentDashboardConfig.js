const OSAC_CONNECTIVITY_COMPONENT = 'Connectivity&Fabric'

function panel(component, { notInComponents = [] } = {}) {
  return { id: component, component, notInComponents }
}

// A Feature joins a panel through its own Components or those of its live source Epics.
// CaaS/BMaaS/VMaaS defer to Connectivity&Fabric when the Feature itself carries that
// Component, and an enclave-only Feature appears only under the Enclave panel.
const OSAC_COMPONENT_DASHBOARD = {
  scopeDescription: 'One card per Feature with UI/UX work, placed by the Feature\'s own Fix Version and by its Components and those of its UI/UX Epics. Features labelled no-ui are excluded, and enclave-only Features appear only under Enclave. UX and UI statuses are Feature-wide rollups across all of the Feature\'s UI/UX Epics, not statuses for the selected Release or Component.',
  panels: [
    panel('Enclave'),
    panel('CaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('BMaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('VMaaS', { notInComponents: [OSAC_CONNECTIVITY_COMPONENT] }),
    panel('Core'),
    panel(OSAC_CONNECTIVITY_COMPONENT),
    panel('Metering, Billing and Quota'),
    panel('Storage'),
    panel('Observability')
  ],
  enclavePanel: 'Enclave',
  otherPanel: 'Other',
  // Feature resolutions that mean no delivery. A project profile's terminalOutcomes.nonDelivery
  // takes precedence when it defines one.
  nonDeliveryResolutions: ['Duplicate', "Won't Do", 'Obsolete', 'Cannot Reproduce', 'Declined'],
  // Epic resolutions the collector treats as no work; such source Epics are labelled, not hidden.
  noWorkResolutions: ["Won't Do", 'Obsolete', 'Duplicate', 'Cannot Reproduce'],
  // Highest first.
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
