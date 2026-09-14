const PREPARATION_STATE_HELP = {
  ready: 'Required preparation is confirmed complete.',
  pending: 'Required preparation is still pending.',
  unknown: 'There isn’t enough information to determine preparation readiness.'
}

// not-applicable has no defined help text.
export function preparationHelpText(readiness) {
  const base = PREPARATION_STATE_HELP[readiness]
  return base ? base + ' Preparation is separate from execution progress.' : null
}
