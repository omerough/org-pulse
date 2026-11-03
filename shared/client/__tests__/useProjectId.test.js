/**
 * Reactive project context regression: the singleton ref must track both
 * real hash changes and shell-rewritten hash params (moduleNav.updateParams
 * uses history.pushState, which does not fire hashchange — without the
 * urlchange signal the selector change never reaches any consumer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { watch } from 'vue'

let useProjectId, projectQuery, setDefaultProjectId, resolveProjectId, setKnownProjectIds, useKnownProjectIds

describe('useProjectId', () => {
  beforeEach(async () => {
    vi.resetModules()
    window.location.hash = '#/'
    const mod = await import('@shared/client/composables/useProjectId.js')
    useProjectId = mod.useProjectId
    projectQuery = mod.projectQuery
    setDefaultProjectId = mod.setDefaultProjectId
    resolveProjectId = mod.resolveProjectId
    setKnownProjectIds = mod.setKnownProjectIds
    useKnownProjectIds = mod.useKnownProjectIds
  })

  it('reads the projectId hash param on init', () => {
    window.location.hash = '#/releases/registry?projectId=flightctl'
    const projectId = useProjectId()
    expect(projectId.value).toBe('flightctl')
  })

  it('returns an empty context when no projectId param exists', () => {
    window.location.hash = '#/releases/registry'
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
  })

  it('updates on a real hashchange', async () => {
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
    window.location.hash = '#/releases/registry?projectId=osac'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(projectId.value).toBe('osac')
  })

  it('updates when the shell rewrites hash params without a hashchange', () => {
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
    history.pushState(null, '', '#/people-and-teams/teams?projectId=flightctl')
    window.dispatchEvent(new Event('urlchange'))
    expect(projectId.value).toBe('flightctl')
  })

  it('shares a single ref across consumers', async () => {
    const a = useProjectId()
    const b = useProjectId()
    expect(b).toBe(a)
    window.location.hash = '#/releases/registry?projectId=osac'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(a.value).toBe('osac')
    expect(b.value).toBe('osac')
  })

  it('encodes the project query suffix', () => {
    expect(projectQuery('flightctl')).toBe('?projectId=flightctl')
    expect(projectQuery('')).toBe('')
  })

  describe('default project', () => {
    it('fills in a project-less URL and yields to an explicit URL project', () => {
      const projectId = useProjectId()
      setDefaultProjectId('osac')
      expect(projectId.value).toBe('osac')

      history.pushState(null, '', '#/people?projectId=flightctl')
      window.dispatchEvent(new Event('urlchange'))
      expect(projectId.value).toBe('flightctl')

      history.pushState(null, '', '#/people')
      window.dispatchEvent(new Event('urlchange'))
      expect(projectId.value).toBe('osac')
    })

    it('never exposes an empty project to synchronous watchers once a default exists', () => {
      window.location.hash = '#/people?projectId=osac'
      const projectId = useProjectId()
      setDefaultProjectId('osac')
      const seen = []
      watch(projectId, value => seen.push(value), { flush: 'sync' })

      history.pushState(null, '', '#/people')
      window.dispatchEvent(new Event('urlchange'))

      expect(seen).toEqual([])
      expect(projectId.value).toBe('osac')
    })

    it('stays empty until a default is published and again after it is cleared', () => {
      const projectId = useProjectId()
      expect(projectId.value).toBe('')
      setDefaultProjectId('osac')
      expect(projectId.value).toBe('osac')
      setDefaultProjectId('')
      expect(projectId.value).toBe('')
    })

    it('resolves a URL project against the default', () => {
      expect(resolveProjectId(undefined)).toBe('')
      setDefaultProjectId('osac')
      expect(resolveProjectId(undefined)).toBe('osac')
      expect(resolveProjectId('')).toBe('osac')
      expect(resolveProjectId('flightctl')).toBe('flightctl')
    })
  })

  describe('known project IDs', () => {
    it('is empty until the shell publishes the list and again after it is cleared', () => {
      expect(useKnownProjectIds().value).toEqual([])
      setKnownProjectIds(['osac', 'flightctl'])
      expect(useKnownProjectIds().value).toEqual(['osac', 'flightctl'])
      setKnownProjectIds([])
      expect(useKnownProjectIds().value).toEqual([])
    })

    it('copies the published list and ignores non-arrays', () => {
      const ids = ['osac']
      setKnownProjectIds(ids)
      ids.push('flightctl')
      expect(useKnownProjectIds().value).toEqual(['osac'])
      setKnownProjectIds(null)
      expect(useKnownProjectIds().value).toEqual([])
    })
  })
})
