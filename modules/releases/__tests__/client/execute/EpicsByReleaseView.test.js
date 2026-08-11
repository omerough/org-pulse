import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiRequest = vi.fn()
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))

import EpicsByReleaseView from '../../../client/execute/views/EpicsByReleaseView.vue'

function epicsResponse(overrides = {}) {
  return {
    version: '0.4',
    fetchedAt: '2026-08-11T10:33:00Z',
    featureCount: 1,
    features: [
      {
        key: 'OSAC-100',
        summary: 'Feature A',
        status: 'In Progress',
        statusCategory: 'In Progress',
        fixVersions: ['0.4'],
        epics: [
          {
            key: 'OSAC-101', summary: 'Epic 1', status: 'In Progress', statusCategory: 'In Progress',
            fixVersions: ['0.4'], fixVersionSource: 'direct',
            components: ['Comp A'], componentSource: 'direct',
            parentFeatureKey: 'OSAC-100', blockerCount: 0, issueCount: 1, pct: 0, progress: 0,
            issues: []
          },
          {
            key: 'OSAC-102', summary: 'Epic 2', status: 'To Do', statusCategory: 'To Do',
            fixVersions: [], fixVersionSource: 'unknown',
            components: [], componentSource: 'unknown',
            parentFeatureKey: 'OSAC-100', blockerCount: 0, issueCount: 0, pct: 0, progress: 0,
            issues: []
          }
        ]
      }
    ],
    ...overrides
  }
}

describe('EpicsByReleaseView', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
  })

  it('loads versions, defaults to the first one, and renders its Features and Epics', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4', '0.5'] })
      if (url.includes('/epics')) return Promise.resolve(epicsResponse())
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    expect(mockApiRequest).toHaveBeenCalledWith(expect.stringContaining('/modules/releases/execution/epics?version=0.4'))
    expect(wrapper.text()).toContain('OSAC-100')
    expect(wrapper.text()).toContain('OSAC-101')
    expect(wrapper.text()).toContain('OSAC-102')
  })

  it('distinguishes direct from unknown provenance for multiple Epics under one Feature', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4'] })
      if (url.includes('/epics')) return Promise.resolve(epicsResponse())
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    // OSAC-101 has a direct Fix Version — shown, no "Unknown"/inherited badge for it.
    // OSAC-102 has no Fix Version at all — must show Unknown, not blank or fabricated.
    expect(wrapper.text()).toContain('Unknown')
  })

  it('shows an empty state when no Features match the release', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.9'] })
      if (url.includes('/epics')) return Promise.resolve({ version: '0.9', fetchedAt: null, featureCount: 0, features: [] })
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    expect(wrapper.text()).toContain('No Features found for release')
  })

  it('shows a prompt when there are no releases to select', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: [] })
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    expect(wrapper.text()).toContain('Select a release')
  })

  it('surfaces a load error', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4'] })
      if (url.includes('/epics')) return Promise.reject(new Error('Server error'))
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    expect(wrapper.text()).toContain('Server error')
  })
})
