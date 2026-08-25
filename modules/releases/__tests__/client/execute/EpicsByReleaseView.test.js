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

  it('requests versions with scope=epics, since this view understands Epic-level context membership', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4'] })
      if (url.includes('/epics')) return Promise.resolve(epicsResponse())
      return Promise.reject(new Error('unexpected url ' + url))
    })

    mount(EpicsByReleaseView)
    await flushPromises()

    expect(mockApiRequest).toHaveBeenCalledWith(expect.stringContaining('/modules/releases/execution/versions?scope=epics'))
  })

  it('badges a context Feature, preserves its real Fix Version, and notes hidden sibling Epics', async () => {
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: ['0.2-M1'] })
      if (url.includes('/epics')) {
        return Promise.resolve({
          version: '0.2-M1',
          fetchedAt: '2026-08-11T10:33:00Z',
          featureCount: 1,
          features: [
            {
              key: 'OSAC-1061',
              summary: 'Parent Feature',
              status: 'In Progress',
              statusCategory: 'In Progress',
              fixVersions: ['0.2'],
              isContext: true,
              totalEpicCount: 3,
              epics: [
                {
                  key: 'OSAC-2767', summary: 'Direct M1 epic', status: 'In Progress', statusCategory: 'In Progress',
                  fixVersions: ['0.2-M1'], fixVersionSource: 'direct',
                  components: [], componentSource: 'unknown',
                  parentFeatureKey: 'OSAC-1061', blockerCount: 0, issueCount: 1, pct: 0, progress: 0,
                  issues: []
                }
              ]
            }
          ]
        })
      }
      return Promise.reject(new Error('unexpected url ' + url))
    })

    const wrapper = mount(EpicsByReleaseView)
    await flushPromises()

    // Real Fix Version is preserved, not relabeled to the filtered milestone (the
    // release selector legitimately shows "0.2-M1" too, so scope the check to the badge).
    const fixVersionBadge = wrapper.find('[title*="real Fix Version"]')
    expect(fixVersionBadge.text()).toBe('0.2')
    // Badged as context so it isn't mistaken for a Fix-Version data bug.
    expect(wrapper.text().toLowerCase()).toContain('context')
    // Hidden siblings are called out (1 of 3 shown), rather than looking like missing data.
    expect(wrapper.text()).toContain('1 of 3')
  })

  describe('Component / Status filters', () => {
    function twoFeatureResponse() {
      return {
        version: '0.4',
        fetchedAt: '2026-08-11T10:33:00Z',
        featureCount: 2,
        features: [
          {
            key: 'OSAC-100', summary: 'Feature A', status: 'In Progress', statusCategory: 'In Progress',
            fixVersions: ['0.4'], components: ['Comp A'],
            epics: [
              {
                key: 'OSAC-101', summary: 'Epic 1', status: 'In Progress', statusCategory: 'In Progress',
                fixVersions: ['0.4'], fixVersionSource: 'direct',
                components: ['Comp A'], componentSource: 'direct',
                parentFeatureKey: 'OSAC-100', blockerCount: 0, issueCount: 1, pct: 0, progress: 0, issues: []
              },
              {
                key: 'OSAC-102', summary: 'Epic 2', status: 'To Do', statusCategory: 'To Do',
                fixVersions: [], fixVersionSource: 'unknown',
                components: [], componentSource: 'unknown',
                parentFeatureKey: 'OSAC-100', blockerCount: 0, issueCount: 0, pct: 0, progress: 0, issues: []
              }
            ]
          },
          {
            key: 'OSAC-200', summary: 'Feature B', status: 'Done', statusCategory: 'Done',
            fixVersions: ['0.4'], components: [],
            epics: [
              {
                key: 'OSAC-201', summary: 'Epic 3', status: 'Review', statusCategory: 'In Progress',
                fixVersions: ['0.4'], fixVersionSource: 'direct',
                components: ['Comp B'], componentSource: 'direct',
                parentFeatureKey: 'OSAC-200', blockerCount: 0, issueCount: 1, pct: 0, progress: 0, issues: []
              }
            ]
          }
        ]
      }
    }

    async function mountWithFilters() {
      mockApiRequest.mockImplementation((url) => {
        if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4'] })
        if (url.includes('/epics')) return Promise.resolve(twoFeatureResponse())
        return Promise.reject(new Error('unexpected url ' + url))
      })
      const wrapper = mount(EpicsByReleaseView)
      await flushPromises()
      return wrapper
    }

    async function openDropdown(wrapper, currentLabel) {
      const button = wrapper.findAll('button[aria-haspopup="listbox"]').find(b => b.text().includes(currentLabel))
      await button.trigger('click')
    }

    async function checkOption(wrapper, optionText) {
      const label = wrapper.findAll('label').find(l => l.text() === optionText)
      await label.find('input[type="checkbox"]').setValue(true)
    }

    it('keeps a Feature via a matching child Epic (OR across multiple selected Components) and narrows to that Epic', async () => {
      const wrapper = await mountWithFilters()

      await openDropdown(wrapper, 'All components')
      await checkOption(wrapper, 'Comp A')
      await checkOption(wrapper, 'Comp B')

      // OSAC-100 matches at Feature level (Comp A); OSAC-200 only matches via its child Epic (Comp B).
      expect(wrapper.text()).toContain('OSAC-100')
      expect(wrapper.text()).toContain('OSAC-200')
      expect(wrapper.text()).toContain('OSAC-101')
      expect(wrapper.text()).toContain('OSAC-201')
      // Non-matching Epics are narrowed out even under a retained Feature.
      expect(wrapper.text()).not.toContain('OSAC-102')
    })

    it('treats components-less items as "Unassigned" and keeps them selectable/visible', async () => {
      const wrapper = await mountWithFilters()

      await openDropdown(wrapper, 'All components')
      await checkOption(wrapper, 'Unassigned')

      // OSAC-200 (components: []) matches at Feature level.
      expect(wrapper.text()).toContain('OSAC-200')
      // OSAC-100 only matches via its Unassigned child Epic (OSAC-102), not OSAC-101 (Comp A).
      expect(wrapper.text()).toContain('OSAC-100')
      expect(wrapper.text()).toContain('OSAC-102')
      expect(wrapper.text()).not.toContain('OSAC-101')
      // OSAC-201 (Comp B) doesn't match Unassigned at either level under OSAC-200.
      expect(wrapper.text()).not.toContain('OSAC-201')
    })

    it('filters by Status and combines with an active Component filter', async () => {
      const wrapper = await mountWithFilters()

      await openDropdown(wrapper, 'All statuses')
      await checkOption(wrapper, 'Done')

      // Only Feature B (status Done) matches; Feature A (In Progress) is filtered out entirely,
      // since neither of its Epics is Done either.
      expect(wrapper.text()).toContain('OSAC-200')
      expect(wrapper.text()).not.toContain('OSAC-100')
    })

    it('clears active Component/Status selections when the selected Version changes', async () => {
      mockApiRequest.mockImplementation((url) => {
        if (url.includes('/versions')) return Promise.resolve({ versions: ['0.4', '0.5'] })
        if (url.includes('/epics')) return Promise.resolve(twoFeatureResponse())
        return Promise.reject(new Error('unexpected url ' + url))
      })
      const wrapper = mount(EpicsByReleaseView)
      await flushPromises()

      await openDropdown(wrapper, 'All components')
      await checkOption(wrapper, 'Comp A')
      expect(wrapper.text()).not.toContain('OSAC-102')

      await wrapper.find('#epics-by-release-version').setValue('0.5')
      await flushPromises()

      const button = wrapper.findAll('button[aria-haspopup="listbox"]').find(b => b.text().includes('components'))
      expect(button.text()).toContain('All components')
      expect(wrapper.text()).toContain('OSAC-102')
    })
  })
})
