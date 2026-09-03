// Shared semantic score palette for AI Impact charts — mirrors the PRD detail
// view's per-criterion score dots (AssessmentBreakdown.vue: green-500/amber-500/red-500)
// so chart colors mean the same thing as the badges users see elsewhere in the module.
export const SCORE_HEX = {
  green: '#22c55e', // Tailwind green-500 — pass / strong
  amber: '#f59e0b', // Tailwind amber-500 — partial / moderate
  red: '#ef4444'    // Tailwind red-500 — fail / weak
}

export function scoreRgba(band, alpha) {
  const rgb = { green: '34, 197, 94', amber: '245, 158, 11', red: '239, 68, 68' }[band]
  return `rgba(${rgb}, ${alpha})`
}

/**
 * Semantic color band for a continuous 0-2 criterion average.
 * Uses the exact average — never round to an integer first, or a 1.9
 * average (clearly "amber") would be miscategorized as "green".
 *
 * Thresholds are deliberately looser than the discrete per-criterion 0/1/2
 * score semantics used elsewhere (e.g. AssessmentBreakdown.vue's score dots):
 * an *average* of 1.75+ across many reviews already reflects strong,
 * consistent performance and shouldn't share amber with an average near 1.0.
 */
export function bandForCriterionAvg(avg) {
  if (avg >= 1.75) return 'green'
  if (avg >= 1) return 'amber'
  return 'red'
}
