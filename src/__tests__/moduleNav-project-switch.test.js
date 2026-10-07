/**
 * Exercises the real moduleNav.updateParams (via createModuleNav) through the
 * real ProjectSelector, not a mock of the reset logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProjectSelector from '../components/ProjectSelector.vue'
import { createModuleNav, getDefaultViewId, resolveSectionRootViewId } from '../composables/useModuleNav'

const twoProjects = {
  projects: [
    { projectId: 'osac', displayName: 'OSAC' },
    { projectId: 'flightctl', displayName: 'Flight Control' }
  ]
}

const teamTrackerManifest = {
  slug: 'team-tracker',
  client: {
    resetSectionOnProjectSwitch: true,
    navItems: [
      { id: 'home', label: 'Team Directory', default: true },
      { id: 'people', label: 'People' },
      { id: 'reports', label: 'Reports' },
      { id: 'org-dashboard', label: 'Org Dashboard' }
    ]
  }
}

const releasesManifest = {
  slug: 'releases',
  client: {
    navItems: [
      { id: 'execute', label: 'Execute', default: true },
      { id: 'deliver', label: 'Deliver' }
    ]
  }
}

function mountWithRealNav(initialHash, { manifests = [teamTrackerManifest], activeSlug = 'team-tracker' } = {}) {
  window.location.hash = initialHash
  const activeModuleSlugRef = ref(activeSlug)
  const builtInManifests = ref(manifests)
  const moduleNav = createModuleNav({ activeModuleSlugRef, builtInManifests })
  apiRequest.mockResolvedValueOnce(twoProjects)
  const wrapper = mount(ProjectSelector, {
    global: {
      provide: {
        moduleNav: {
          navigateTo: moduleNav.navigateTo,
          updateParams: moduleNav.updateParams,
          goBack: moduleNav.goBack,
          isModuleAvailable: moduleNav.isModuleAvailable,
          params: moduleNav.routeParams
        }
      }
    }
  })
  return { wrapper, moduleNav }
}

async function switchProjectTo(wrapper, projectId) {
  await flushPromises()
  await wrapper.find('select#project-selector').setValue(projectId)
}

describe('project switch resets to the current section root (central updateParams rule)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('People -> switch project -> People', async () => {
    const { wrapper, moduleNav } = mountWithRealNav('#/team-tracker/people?projectId=osac')
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/people?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('Team Directory -> switch project -> Team Directory under the new project', async () => {
    const { wrapper, moduleNav } = mountWithRealNav('#/team-tracker/home?projectId=osac')
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/home?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('Team Detail/Overview -> switch project -> Team Directory', async () => {
    const { wrapper, moduleNav } = mountWithRealNav(
      '#/team-tracker/team-detail?teamKey=alpha&tab=overview&projectId=osac'
    )
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/home?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('Team Detail/Delivery -> switch project -> Team Directory', async () => {
    const { wrapper, moduleNav } = mountWithRealNav(
      '#/team-tracker/team-detail?teamKey=alpha&tab=delivery&projectId=osac'
    )
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/home?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('Reports -> switch project -> Reports, dropping the selected report', async () => {
    const { wrapper, moduleNav } = mountWithRealNav('#/team-tracker/reports?report=trends&projectId=osac')
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/reports?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('Person Detail -> switch project -> Team Directory, not preserving the person entity', async () => {
    const { wrapper, moduleNav } = mountWithRealNav(
      '#/team-tracker/person-detail?teamKey=alpha&person=acc-123&projectId=osac'
    )
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/team-tracker/home?projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ projectId: 'flightctl' })
  })

  it('preserves the newly selected projectId and drops every other stale param', async () => {
    const { wrapper, moduleNav } = mountWithRealNav(
      '#/team-tracker/person-detail?teamKey=alpha&person=acc-123&tab=delivery&projectId=osac'
    )
    await switchProjectTo(wrapper, 'flightctl')

    const params = moduleNav.routeParams.value
    expect(params.projectId).toBe('flightctl')
    expect(Object.keys(params)).toEqual(['projectId'])
  })

  it('does not reset navigation state when projectId is unchanged', async () => {
    const { moduleNav } = mountWithRealNav('#/team-tracker/team-detail?teamKey=alpha&projectId=osac')
    await flushPromises()
    moduleNav.updateParams({ projectId: 'osac' })

    expect(window.location.hash).toBe('#/team-tracker/team-detail?teamKey=alpha&projectId=osac')
    expect(moduleNav.routeParams.value).toEqual({ teamKey: 'alpha', projectId: 'osac' })
  })

  it('does not discard a valid legacy detail route when the selector assigns the default project', async () => {
    // No projectId on the initial hash is a valid legacy OSAC deep link; the
    // selector assigning a default project here must not be treated as a
    // project switch, or this detail route would be reset on every cold load.
    const { wrapper, moduleNav } = mountWithRealNav('#/team-tracker/team-detail?teamKey=alpha')
    await flushPromises()

    expect(window.location.hash).toBe('#/team-tracker/team-detail?teamKey=alpha&projectId=osac')
    expect(moduleNav.routeParams.value).toEqual({ teamKey: 'alpha', projectId: 'osac' })
    expect(wrapper.find('select#project-selector').exists()).toBe(true)
  })

  it('does not reset a module that has not opted into resetSectionOnProjectSwitch', async () => {
    const { wrapper, moduleNav } = mountWithRealNav(
      '#/releases/feature-detail?featureKey=abc&projectId=osac',
      { manifests: [releasesManifest, teamTrackerManifest], activeSlug: 'releases' }
    )
    await switchProjectTo(wrapper, 'flightctl')

    expect(window.location.hash).toBe('#/releases/feature-detail?featureKey=abc&projectId=flightctl')
    expect(moduleNav.routeParams.value).toEqual({ featureKey: 'abc', projectId: 'flightctl' })
  })
})

describe('resolveSectionRootViewId (manifest-driven section resolution)', () => {
  it('a navItem is its own section root', () => {
    expect(resolveSectionRootViewId(teamTrackerManifest, 'people', {})).toBe('people')
    expect(resolveSectionRootViewId(teamTrackerManifest, 'reports', {})).toBe('reports')
  })

  it('falls back to the module default view for a route the manifest does not place in a section', () => {
    expect(resolveSectionRootViewId(teamTrackerManifest, 'team-detail', {})).toBe('home')
    expect(resolveSectionRootViewId(teamTrackerManifest, 'person-detail', {})).toBe('home')
  })

  it('honors an explicit hiddenRoutes mapping to its owning navItem', () => {
    const manifest = {
      slug: 'releases',
      client: {
        navItems: [{ id: 'execute', label: 'Execute', default: true }, { id: 'deliver', label: 'Deliver' }],
        hiddenRoutes: { 'feature-detail': 'execute' }
      }
    }
    expect(resolveSectionRootViewId(manifest, 'feature-detail', {})).toBe('execute')
  })

  it('resolves a $param hiddenRoutes reference from the current route params', () => {
    const manifest = {
      slug: 'product-builds',
      client: {
        navItems: [{ id: 'osac', label: 'OSAC', default: true }, { id: 'flightctl', label: 'Flight Control' }],
        hiddenRoutes: { 'series-detail': '$product' }
      }
    }
    expect(resolveSectionRootViewId(manifest, 'series-detail', { product: 'flightctl' })).toBe('flightctl')
  })

  it('getDefaultViewId resolves the People & Teams default view to Team Directory', () => {
    expect(getDefaultViewId(teamTrackerManifest)).toBe('home')
  })
})
