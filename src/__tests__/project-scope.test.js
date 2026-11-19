import { describe, it, expect } from 'vitest'
import {
  moduleAppliesToProject,
  filterModulesForProject,
  projectIdsAllow,
  viewAppliesToProject
} from '../utils/project-scope'
import releasesManifest from '../../modules/releases/module.json'

const osacOnly = { slug: 'test-coverage', client: { projectIds: ['osac'] } }
const shared = { slug: 'team-tracker', client: {} }

describe('moduleAppliesToProject', () => {
  it('keeps an unscoped module available in every project', () => {
    expect(moduleAppliesToProject(shared, 'osac')).toBe(true)
    expect(moduleAppliesToProject(shared, 'flightctl')).toBe(true)
    expect(moduleAppliesToProject(shared, '')).toBe(true)
  })

  it('keeps a project-scoped module available for its own project', () => {
    expect(moduleAppliesToProject(osacOnly, 'osac')).toBe(true)
  })

  it('hides a project-scoped module for another project', () => {
    expect(moduleAppliesToProject(osacOnly, 'flightctl')).toBe(false)
  })

  it('keeps a project-scoped module available when no project is selected', () => {
    // Legacy single-project mode: no projectId means today's behavior.
    expect(moduleAppliesToProject(osacOnly, null)).toBe(true)
    expect(moduleAppliesToProject(osacOnly, '')).toBe(true)
  })

  it('treats an empty projectIds list as unscoped', () => {
    expect(moduleAppliesToProject({ client: { projectIds: [] } }, 'flightctl')).toBe(true)
  })

  it('ignores manifests without a client block', () => {
    expect(moduleAppliesToProject({ slug: 'x' }, 'flightctl')).toBe(true)
  })
})

describe('projectIdsAllow', () => {
  it('allows declared projects and legacy unqualified access', () => {
    expect(projectIdsAllow(['osac'], 'osac')).toBe(true)
    expect(projectIdsAllow(['osac'], '')).toBe(true)
    expect(projectIdsAllow(['osac'], null)).toBe(true)
  })

  it('rejects other projects', () => {
    expect(projectIdsAllow(['osac'], 'flightctl')).toBe(false)
  })

  it('allows everything when no projectIds are declared', () => {
    expect(projectIdsAllow(undefined, 'flightctl')).toBe(true)
    expect(projectIdsAllow([], 'flightctl')).toBe(true)
  })
})

describe('filterModulesForProject', () => {
  it('drops scoped-out modules and keeps the rest in order', () => {
    const manifests = [shared, osacOnly, { slug: 'releases' }]
    expect(filterModulesForProject(manifests, 'flightctl').map(m => m.slug)).toEqual(['team-tracker', 'releases'])
    expect(filterModulesForProject(manifests, 'osac').map(m => m.slug)).toEqual(['team-tracker', 'test-coverage', 'releases'])
  })

  it('handles a missing manifest list', () => {
    expect(filterModulesForProject(null, 'osac')).toEqual([])
  })
})

describe('viewAppliesToProject', () => {
  const releases = {
    slug: 'releases',
    client: {
      navItems: [{ id: 'execute' }, { id: 'deliver' }],
      viewProjectIds: { deliver: ['osac'], plan: ['osac'] }
    }
  }

  it('scopes a nav item to its declared projects', () => {
    expect(viewAppliesToProject(releases, 'deliver', 'osac')).toBe(true)
    expect(viewAppliesToProject(releases, 'deliver', 'flightctl')).toBe(false)
    expect(viewAppliesToProject(releases, 'execute', 'flightctl')).toBe(true)
  })

  it('scopes a hidden route that has no nav item', () => {
    expect(viewAppliesToProject(releases, 'plan', 'osac')).toBe(true)
    expect(viewAppliesToProject(releases, 'plan', 'flightctl')).toBe(false)
  })

  it('keeps legacy unqualified access and unlisted routes', () => {
    expect(viewAppliesToProject(releases, 'plan', '')).toBe(true)
    expect(viewAppliesToProject(releases, 'feature-detail', 'flightctl')).toBe(true)
  })

  it('applies the module scope first', () => {
    expect(viewAppliesToProject(osacOnly, 'coverage', 'flightctl')).toBe(false)
  })
})

describe('shipped Releases manifest scoping', () => {
  it.each(['schedule', 'execute', 'feature-detail', 'jira-hygiene'])('keeps %s available to every project', viewId => {
    expect(viewAppliesToProject(releasesManifest, viewId, 'flightctl')).toBe(true)
  })

  it.each(['deliver', 'release-plan', 'plan', 'reports'])('limits %s to OSAC', viewId => {
    expect(viewAppliesToProject(releasesManifest, viewId, 'osac')).toBe(true)
    expect(viewAppliesToProject(releasesManifest, viewId, 'flightctl')).toBe(false)
  })
})
