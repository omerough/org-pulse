const { resolveProjectSelection } = require('./project-profile')

const providers = new Map()

function registerProvider(id, fn) {
  if (typeof fn !== 'function') {
    console.warn(`[message-registry] Provider "${id}" is not a function, skipping`)
    return
  }
  providers.set(id, fn)
}

async function getMessages(userContext) {
  const results = []
  const TIMEOUT_MS = 5000

  for (const [id, fn] of providers) {
    try {
      const messages = await Promise.race([
        fn(userContext),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Provider "${id}" timed out`)), TIMEOUT_MS)
        )
      ])
      if (Array.isArray(messages)) {
        results.push(...messages)
      }
    } catch (err) {
      console.warn(`[message-registry] Provider "${id}" failed:`, err.message)
    }
  }

  return results
}

/**
 * The project explicitly selected by `?projectId=`; undefined when unset, malformed or unknown.
 * A well-formed id stays selected when the profile reader fails, because the request is still
 * project-qualified and legacy-only messages must not appear in its place.
 */
function selectedProjectId(projects, query) {
  const selection = resolveProjectSelection(projects, query)
  if (!selection.provided) return undefined
  if (!selection.status) return selection.projectId
  return selection.status >= 500 ? query.projectId : undefined
}

module.exports = { registerProvider, getMessages, selectedProjectId }
