/**
 * Project scoping for built-in modules.
 *
 * A module that declares `client.projectIds`, or a nav item that declares
 * `projectIds`, applies only to the listed shell projects. An empty project ID
 * means the shell has not resolved a project yet; everything stays listed
 * until it does.
 */
export function projectIdsAllow(projectIds, projectId) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return true
  if (!projectId) return true
  return projectIds.includes(projectId)
}

export function moduleAppliesToProject(manifest, projectId) {
  return projectIdsAllow(manifest?.client?.projectIds, projectId)
}

export function filterModulesForProject(manifests, projectId) {
  return (manifests || []).filter((manifest) => moduleAppliesToProject(manifest, projectId))
}

export function navItemAppliesToProject(item, projectId) {
  return projectIdsAllow(item?.projectIds, projectId)
}

/** A view follows the project scope of its module and of its own nav item. */
export function viewAppliesToProject(manifest, viewId, projectId) {
  if (!moduleAppliesToProject(manifest, projectId)) return false
  const item = (manifest?.client?.navItems || []).find(navItem => navItem.id === viewId)
  return !item || navItemAppliesToProject(item, projectId)
}
