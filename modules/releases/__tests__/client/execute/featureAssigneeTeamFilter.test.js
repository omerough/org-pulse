import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'

const mockApiRequest = vi.fn()
vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))
vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ user: ref({}) })
}))

const mockRoster = ref(null)
const mockRosterError = ref(null)
const mockRosterErrorStatus = ref(null)
const mockLoadRoster = vi.fn()
vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    rosterData: mockRoster, error: mockRosterError, errorStatus: mockRosterErrorStatus, loadRoster: mockLoadRoster
  })
}))

const rosterFor = (projectId, overrides = {}) => ({
  projectId,
  availability: 'available',
  teams: [
    { key: `${projectId}::core`, id: 'core', displayName: 'Core Team', memberAccountIds: ['acc-sam', 'acc-amir'] },
    { key: `${projectId}::ui`, id: 'ui', displayName: 'UI Team', memberAccountIds: ['acc-mia', 'acc-amir'] },
    { key: `${projectId}::ops`, id: 'ops', displayName: 'Ops Team', memberAccountIds: ['acc-amir'] }
  ],
  people: [
    { accountId: 'acc-sam', displayName: 'Sam Single', teamIds: ['core'], active: true },
    { accountId: 'acc-mia', displayName: 'Mia Multi', teamIds: ['ui'], active: true },
    { accountId: 'acc-amir', displayName: 'Amir Admin', teamIds: ['core', 'ui', 'ops'], active: true }
  ],
  ...overrides
})

function feature(key, assignee, assigneeAccountId, extra = {}) {
  return {
    key, summary: `Summary ${key}`, status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['1.0.0'],
    components: [], labels: [], epicCount: 0, issueCount: null, blockerCount: null,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
    executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
    preparationReadiness: 'pending', workStatus: { source: 'jira-feature-status', state: 'in-progress' },
    coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'pr-status-evidence' },
    assignee, assigneeAccountId, ...extra
  }
}

const FEATURES = [
  feature('F-SAM', 'Sam Single', 'acc-sam'),
  feature('F-MIA', 'Mia Multi', 'acc-mia'),
  feature('F-AMIR', 'Amir Admin', 'acc-amir', {
    fixVersions: ['2.0.0'], status: 'Backlog', statusCategory: 'To Do', preparationReadiness: 'ready',
    workStatus: { source: 'jira-feature-status', state: 'inactive' }
  }),
  feature('F-NONE', null, null),
  feature('F-STRANGER', 'Stan Stranger', 'acc-stranger'),
  feature('F-NOID', 'Mia Multi', null)
]

async function mountOverview(projectId = 'flightctl', features = FEATURES) {
  window.location.hash = `#/releases/execute?projectId=${projectId}`
  window.dispatchEvent(new Event('urlchange'))
  mockApiRequest.mockImplementation(url => {
    if (url.includes('/versions')) return Promise.resolve({ projectId, versions: ['1.0.0', '2.0.0'] })
    return Promise.resolve({ projectId, state: 'supported', partial: false, features, featureCount: features.length })
  })
  const wrapper = mount(OverviewView, {
    global: {
      provide: { moduleNav: { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({}) } },
      stubs: { Teleport: true, Transition: true }
    }
  })
  await flushPromises()
  await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
  return wrapper
}

const visibleKeys = wrapper => wrapper.findAll('tbody tr').map(r => FEATURES.find(f => r.text().includes(f.key))?.key).filter(Boolean)
const filterRoot = wrapper => wrapper.find('[data-testid="assignee-team-filter"]')

async function pick(wrapper, buttonText, optionText) {
  const findOption = () => wrapper.findAll('label').find(l => l.text() === optionText)
  if (!findOption()) await wrapper.findAll('button').find(b => b.text().includes(buttonText)).trigger('click')
  const option = findOption()
  await option.find('input[type="checkbox"]').setValue(true)
}

describe('Feature List Assignee’s Team filter', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    mockLoadRoster.mockReset()
    sessionStorage.clear()
    mockRoster.value = rosterFor('flightctl')
    mockRosterError.value = null
    mockRosterErrorStatus.value = null
  })

  it('offers published teams plus explicit Unassigned and Not in Roster options', async () => {
    const wrapper = await mountOverview()
    await filterRoot(wrapper).find('button').trigger('click')
    const labels = filterRoot(wrapper).findAll('label').filter(l => l.find('input').exists()).map(l => l.text())
    expect(labels).toEqual(['Core Team', 'Ops Team', 'UI Team', 'Unassigned', 'Not in Roster'])
  })

  it('matches a multi-team administrator under each of their teams without inventing ownership', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Ops Team')
    expect(visibleKeys(wrapper)).toEqual(['F-AMIR'])

    await pick(wrapper, 'Ops Team', 'UI Team')
    expect(visibleKeys(wrapper).sort()).toEqual(['F-AMIR', 'F-MIA'])
    // F-SAM stays Core-only; the administrator's other memberships do not attach to it.
    expect(visibleKeys(wrapper)).not.toContain('F-SAM')
  })

  it('filters Unassigned and Not in Roster, and never places an identity-less assignee in either', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Unassigned')
    expect(visibleKeys(wrapper)).toEqual(['F-NONE'])
    await pick(wrapper, 'Unassigned', 'Not in Roster')
    expect(visibleKeys(wrapper).sort()).toEqual(['F-NONE', 'F-STRANGER'])
    expect(visibleKeys(wrapper)).not.toContain('F-NOID')
  })

  it('composes with Release, Work Status and Assignee filters and leaves status and readiness intact', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Core Team')
    expect(visibleKeys(wrapper).sort()).toEqual(['F-AMIR', 'F-SAM'])

    await pick(wrapper, 'All Versions', '2.0.0')
    expect(visibleKeys(wrapper)).toEqual(['F-AMIR'])

    const row = wrapper.findAll('tbody tr')[0].text()
    expect(row).toContain('Inactive')
    expect(row).toContain('Ready')

    await pick(wrapper, 'All Work Statuses', 'In Progress')
    expect(visibleKeys(wrapper)).toEqual([])
  })

  it('still narrows by the existing Assignee filter within a team', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Core Team')
    await pick(wrapper, 'All assignees', 'Sam Single')
    expect(visibleKeys(wrapper)).toEqual(['F-SAM'])
  })

  it('clears the selection with the other filters', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Core Team')
    await wrapper.findAll('button').find(b => b.text() === 'Clear filters').trigger('click')
    expect(visibleKeys(wrapper)).toHaveLength(FEATURES.length)
    expect(filterRoot(wrapper).text()).toContain('All teams')
  })

  it('disables the control and drops the selection when the roster becomes unavailable', async () => {
    const wrapper = await mountOverview()
    await pick(wrapper, 'All teams', 'Core Team')
    mockRoster.value = rosterFor('flightctl', { availability: 'unavailable', teams: [], people: [] })
    await flushPromises()
    const button = filterRoot(wrapper).find('button')
    expect(button.element.disabled).toBe(true)
    expect(button.text()).toBe('Roster unavailable')
    expect(visibleKeys(wrapper)).toHaveLength(FEATURES.length)
  })

  it('is hidden for a legacy roster or a project that publishes no roster', async () => {
    mockRoster.value = { orgs: {} }
    const wrapper = await mountOverview()
    expect(filterRoot(wrapper).exists()).toBe(false)
    mockRoster.value = null
    mockRosterError.value = 'Project roster publication is unavailable'
    mockRosterErrorStatus.value = 404
    await flushPromises()
    expect(filterRoot(wrapper).exists()).toBe(false)
    expect(visibleKeys(wrapper)).toHaveLength(FEATURES.length)
  })

  it.each([[500], [null]])('shows the control as unavailable when the roster fetch fails (status %s)', async status => {
    mockRoster.value = null
    mockRosterError.value = 'Roster request failed'
    mockRosterErrorStatus.value = status
    const wrapper = await mountOverview()
    const button = filterRoot(wrapper).find('button')
    expect(button.element.disabled).toBe(true)
    expect(button.text()).toBe('Roster unavailable')
    expect(visibleKeys(wrapper)).toHaveLength(FEATURES.length)
  })

  it('ignores another project’s roster and resets the selection on project switch', async () => {
    const wrapper = await mountOverview('flightctl')
    await pick(wrapper, 'All teams', 'Core Team')

    window.location.hash = '#/releases/execute?projectId=osac'
    window.dispatchEvent(new Event('urlchange'))
    mockRoster.value = rosterFor('flightctl')
    await flushPromises()
    expect(filterRoot(wrapper).exists()).toBe(false)

    mockRoster.value = rosterFor('osac')
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
    expect(filterRoot(wrapper).find('button').text()).toBe('All teams')
    expect(visibleKeys(wrapper)).toHaveLength(FEATURES.length)
  })

  it('requests the project roster on mount', async () => {
    await mountOverview('flightctl')
    expect(mockLoadRoster).toHaveBeenCalledTimes(1)
  })
})
