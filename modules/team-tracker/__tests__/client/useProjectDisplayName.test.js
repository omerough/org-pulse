import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { useProjectDisplayName } from '../../client/composables/useProjectDisplayName'

const projectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'

const registry = {
  projects: [
    { projectId: 'osac', displayName: 'OSAC' },
    { projectId: 'flightctl', displayName: 'Flight Control' },
    { projectId: 'nameless' }
  ]
}

describe('useProjectDisplayName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = ''
    apiRequest.mockResolvedValue(registry)
  })

  it.each([
    ['osac', 'OSAC'],
    ['flightctl', 'Flight Control']
  ])('resolves %s to "%s" from the project registry', async (id, label) => {
    projectId.value = id
    const name = useProjectDisplayName()
    await flushPromises()

    expect(name.value).toBe(label)
    expect(apiRequest).toHaveBeenCalledWith('/projects')
  })

  it('is empty and makes no request without a project', async () => {
    const name = useProjectDisplayName()
    await flushPromises()

    expect(name.value).toBe('')
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it.each([
    ['an unregistered project', 'unregistered'],
    ['a project without a display name', 'nameless']
  ])('falls back to the raw ID for %s', async (_label, id) => {
    projectId.value = id
    const name = useProjectDisplayName()
    await flushPromises()

    expect(name.value).toBe(id)
  })

  it('falls back to the raw ID when the registry request fails', async () => {
    apiRequest.mockRejectedValue(new Error('unavailable'))
    projectId.value = 'osac'
    const name = useProjectDisplayName()
    await flushPromises()

    expect(name.value).toBe('osac')
  })

  it('never shows the previous project name after a switch', async () => {
    projectId.value = 'osac'
    const name = useProjectDisplayName()
    await flushPromises()
    expect(name.value).toBe('OSAC')

    projectId.value = 'flightctl'
    expect(name.value).toBe('flightctl')
    await flushPromises()
    expect(name.value).toBe('Flight Control')
  })

  it('ignores a late response for a project that is no longer selected', async () => {
    let releaseFirst
    apiRequest.mockReturnValueOnce(new Promise(resolve => { releaseFirst = () => resolve(registry) }))
    projectId.value = 'osac'
    const name = useProjectDisplayName()

    projectId.value = 'flightctl'
    await flushPromises()
    releaseFirst()
    await flushPromises()

    expect(name.value).toBe('Flight Control')
  })
})
