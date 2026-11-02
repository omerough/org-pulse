import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ManagerDashboardView from '../../client/views/ManagerDashboardView.vue'

const mockLoad = vi.fn()
const mockDirectReports = ref([])
const mockIndirectReports = ref([])
const mockTeams = ref([])
const mockLoading = ref(false)
const mockError = ref(null)
const mockReason = ref(null)
const mockIncludeIndirect = ref(false)
const mockAvailability = ref(null)
const mockGeneratedAt = ref(null)
const mockEnrichment = ref(null)
const mockProjectId = ref('flight-control')
const mockResetState = vi.fn()

vi.mock('../../client/composables/useManagerDashboard', () => ({
  useManagerDashboard: () => ({
    directReports: mockDirectReports,
    indirectReports: mockIndirectReports,
    teams: mockTeams,
    loading: mockLoading,
    error: mockError,
    reason: mockReason,
    includeIndirect: mockIncludeIndirect,
    availability: mockAvailability,
    generatedAt: mockGeneratedAt,
    enrichment: mockEnrichment,
    projectId: mockProjectId,
    load: mockLoad,
    resetState: mockResetState
  })
}))

const mounted = []

function mountView(nav = { navigateTo: vi.fn(), goBack: vi.fn(), params: ref({}) }) {
  const wrapper = mount(ManagerDashboardView, { global: { provide: { moduleNav: nav } } })
  mounted.push(wrapper)
  return { nav, wrapper }
}

function findButton(wrapper, text) {
  return wrapper.findAll('button').find(b => b.text().includes(text))
}

beforeEach(() => {
  mockDirectReports.value = [
    { key: 'eng1', accountId: 'acc_eng1', name: 'Erin Eng', title: 'Engineer', teamIds: ['t_core'], managerRef: { kind: 'roster', accountId: 'acc_mgr' } }
  ]
  mockIndirectReports.value = []
  mockTeams.value = [
    { id: 't_core', name: 'Core', orgKey: 'flight-control', totalMemberCount: 3, directReportAccountIds: ['acc_eng1'], directReportCount: 1 }
  ]
  mockLoading.value = false
  mockError.value = null
  mockReason.value = null
  mockIncludeIndirect.value = false
  mockAvailability.value = 'available'
  mockGeneratedAt.value = null
  mockEnrichment.value = null
  mockProjectId.value = 'flight-control'
  mockResetState.mockClear()
  mockLoad.mockClear()
})

afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
})

describe('ManagerDashboardView', () => {
  it('loads the dashboard on mount and renders reports keyed by accountId', async () => {
    const { wrapper } = mountView()
    await flushPromises()

    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Erin Eng')
    expect(wrapper.text()).toContain('Supported')
    expect(findButton(wrapper, 'Edit All Fields')).toBeUndefined()
    expect(wrapper.find('[title="Dashboard tour"]').exists()).toBe(false)
  })

  it('shows the loading and error states', async () => {
    mockLoading.value = true
    const { wrapper } = mountView()
    expect(wrapper.text()).toContain('Loading dashboard')

    mockLoading.value = false
    mockError.value = 'boom'
    await nextTick()
    expect(wrapper.text()).toContain('boom')
    expect(wrapper.text()).not.toContain('Erin Eng')
  })

  it('handles reason "no-registry-identity" as an unmatched project identity', async () => {
    mockReason.value = 'no-registry-identity'
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No Registry Identity')
    expect(wrapper.text()).toContain("published roster")
  })

  it('handles reason "no-direct-reports" empty state', async () => {
    mockReason.value = 'no-direct-reports'
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No Direct Reports')
  })

  it('handles reason "hierarchy-unavailable" empty state', async () => {
    mockReason.value = 'hierarchy-unavailable'
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Manager Hierarchy Unavailable')
    expect(wrapper.text()).not.toContain('No Direct Reports')
  })

  it('represents an unavailable publication without a zeroed dashboard', async () => {
    mockAvailability.value = 'unavailable'
    mockReason.value = 'publication-not-fresh'
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Manager dashboard unavailable')
    expect(wrapper.text()).toContain('publication-not-fresh')
  })

  it('notes a stale or partial enrichment publication', async () => {
    mockEnrichment.value = { state: 'stale' }
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Profiles: stale')
  })

  it('links a report to the canonical profile by accountId', async () => {
    const { wrapper, nav } = mountView()
    await flushPromises()

    await findButton(wrapper, 'Erin Eng').trigger('click')
    expect(nav.navigateTo).toHaveBeenCalledWith('person-detail', { accountId: 'acc_eng1' })
  })

  it('renders external reports with a null accountId as distinct rows and opens their ldapUid profile', async () => {
    mockIncludeIndirect.value = true
    mockDirectReports.value = [
      { key: 'ldap:dirone', accountId: null, ldapUid: 'dirone', name: 'Dir One', title: 'Director', teamIds: [], managerRef: null },
      { key: 'ldap:dirtwo', accountId: null, ldapUid: 'dirtwo', name: 'Dir Two', title: 'Director', teamIds: [], managerRef: null }
    ]
    mockIndirectReports.value = [
      { key: 'ldap:dirthree', accountId: null, ldapUid: 'dirthree', name: 'Dir Three', title: 'Director', teamIds: [], indirect: true }
    ]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { wrapper, nav } = mountView()
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => r.text().includes('indirect')).map(r => r.text())).toEqual([expect.stringContaining('Dir Three')])
    expect(warn.mock.calls.flat().join(' ')).not.toContain('Duplicate keys')
    warn.mockRestore()

    await findButton(wrapper, 'Dir Two').trigger('click')
    expect(nav.navigateTo).toHaveBeenCalledWith('person-detail', { ldapUid: 'dirtwo' })
  })

  it('shows the indirect badge for non-direct reports when indirect is included', async () => {
    mockIncludeIndirect.value = true
    mockIndirectReports.value = [
      { accountId: 'acc_eng2', name: 'Evan Eng', title: 'Engineer', teamIds: ['t_edge'], indirect: true }
    ]
    const { wrapper } = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Evan Eng')
    expect(wrapper.text()).toContain('indirect')
  })

  it('reloads with the indirect toggle', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    mockLoad.mockClear()

    await wrapper.find('[role="switch"]').trigger('click')
    expect(mockIncludeIndirect.value).toBe(true)
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it('renders managed teams with counts and opens Team Detail by the project-qualified key', async () => {
    const { wrapper, nav } = mountView()
    await flushPromises()

    await findButton(wrapper, 'My Teams').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Members')

    await findButton(wrapper, 'Core').trigger('click')
    expect(nav.navigateTo).toHaveBeenCalledWith('team-detail', { teamKey: 'flight-control::t_core' })
  })

  it('filters reports by search text', async () => {
    mockDirectReports.value = [
      ...mockDirectReports.value,
      { key: 'eng2', accountId: 'acc_eng2', name: 'Sam Smith', title: 'Designer', teamIds: [] }
    ]
    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('sam')
    expect(wrapper.text()).toContain('Sam Smith')
    expect(wrapper.text()).not.toContain('Erin Eng')
  })

  it('drops prior data, resets the tab and reloads when the project changes', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    await findButton(wrapper, 'My Teams').trigger('click')
    mockLoad.mockClear()

    mockProjectId.value = 'osac'
    await flushPromises()

    expect(mockResetState).toHaveBeenCalledTimes(1)
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Erin Eng')
  })
})
