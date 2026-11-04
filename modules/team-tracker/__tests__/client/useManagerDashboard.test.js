import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockProjectId, apiRequest } = vi.hoisted(() => {
  const { ref: r } = require('vue')
  return { mockProjectId: r('osac'), apiRequest: vi.fn() }
})
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId
}))
vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => apiRequest(...args)
}))

import { useManagerDashboard } from '../../client/composables/useManagerDashboard'

beforeEach(() => {
  mockProjectId.value = 'osac'
  apiRequest.mockReset()
})

describe('useManagerDashboard', () => {
  it('qualifies the request by project and carries includeIndirect', async () => {
    mockProjectId.value = 'flight-control'
    apiRequest.mockResolvedValue({
      mode: 'project',
      availability: 'available',
      manager: { accountId: 'acc_mgr' },
      directReports: [{ accountId: 'acc_eng1', name: 'Erin' }],
      teams: []
    })
    const dash = useManagerDashboard()
    dash.includeIndirect.value = true
    await dash.load()

    expect(apiRequest).toHaveBeenCalledWith('/modules/team-tracker/manager/dashboard?projectId=flight-control&includeIndirect=true')
    expect(dash.availability.value).toBe('available')
    expect(dash.directReports.value).toHaveLength(1)
  })

  it('treats osac like any other project and drops a late response from the previous project', async () => {
    mockProjectId.value = 'osac'
    let resolveOsac
    apiRequest.mockImplementationOnce(() => new Promise(resolve => { resolveOsac = resolve }))
    const dash = useManagerDashboard()
    dash.includeIndirect.value = false
    const osacLoad = dash.load()
    expect(apiRequest).toHaveBeenCalledWith('/modules/team-tracker/manager/dashboard?projectId=osac')

    mockProjectId.value = 'flightctl'
    apiRequest.mockResolvedValueOnce({ manager: { accountId: 'fc-mgr' }, directReports: [{ accountId: 'fc-1' }] })
    await dash.load()

    resolveOsac({ manager: { accountId: 'osac-mgr' }, directReports: [{ accountId: 'osac-1' }] })
    await osacLoad

    expect(dash.manager.value).toEqual({ accountId: 'fc-mgr' })
    expect(dash.directReports.value).toEqual([{ accountId: 'fc-1' }])
  })

  it('clears state and records the error on failure', async () => {
    const dash = useManagerDashboard()
    dash.directReports.value = [{ uid: 'stale' }]
    apiRequest.mockRejectedValue(new Error('boom'))
    await dash.load()

    expect(dash.error.value).toBe('boom')
    expect(dash.directReports.value).toEqual([])
  })
})
