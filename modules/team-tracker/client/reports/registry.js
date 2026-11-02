export const reports = [
  {
    id: 'trends',
    title: 'Productivity Trends',
    description: 'Monthly trend lines for issues resolved, contributions, and cycle time.',
    icon: 'TrendingUp',
    tags: ['Jira', 'GitHub', 'GitLab'],
    component: () => import('./TrendsReport.vue'),
    filters: ['team'],
  },
  {
    id: 'team-comparison',
    title: 'Team Comparison',
    description: 'Compare metrics across teams with bar, horizontal, or doughnut charts.',
    icon: 'BarChart3',
    tags: ['Jira', 'GitHub', 'GitLab'],
    component: () => import('./TeamComparisonReport.vue'),
    filters: ['team'],
  },
]
