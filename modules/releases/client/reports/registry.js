/**
 * Report definitions for the releases module.
 * Each entry defines a report card that appears in the Reports hub.
 */
import { defineAsyncComponent } from 'vue'

export const reports = [
  {
    id: 'program-hygiene',
    label: 'Jira Hygiene',
    description: 'Project-wide Jira hygiene rules with unique affected issues, rule and team breakdowns, and a filterable issue table.',
    component: defineAsyncComponent(() => import('./ProgramHygieneReport.vue'))
  },
  {
    id: 'commitment-tracking',
    label: 'Commitment Tracking',
    description: 'Track committed vs. delivered features per release phase. Monitor >90% delivery OKR.',
    icon: 'Target',
    tags: ['Planning', 'OKR'],
    component: defineAsyncComponent(() => import('./CommitmentTrackingReport.vue'))
  },
  {
    id: 'feature-pressure',
    label: 'Feature Pressure',
    description: 'Where feature inflow exceeds capacity to burn down — pressure by component, with PRD pipeline and risk scorecard.',
    component: defineAsyncComponent(() => import('../views/FeaturePressureView.vue'))
  }
]
