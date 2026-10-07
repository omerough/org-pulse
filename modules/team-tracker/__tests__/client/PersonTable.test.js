import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PersonTable from '../../client/components/PersonTable.vue'

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (mod, view, params) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      return `#/${mod}/${view}${qs ? `?${qs}` : ''}`
    }
  })
}))

const { mockProjectId } = vi.hoisted(() => ({ mockProjectId: { value: '' } }))
vi.mock('@shared/client/composables/useProjectId', () => ({
  useProjectId: () => mockProjectId,
  projectParam: (id) => (id ? { projectId: id } : {})
}))

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    visibleFields: ref([]),
    primaryDisplayField: ref(null)
  })
}))

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({ getContributions: () => null })
}))

// OSAC-5968: this list's name link bypasses the row's @select emit, so it
// must carry the project context and accountId identity on its own href.
describe('PersonTable project context preservation (OSAC-5968)', () => {
  beforeEach(() => {
    mockProjectId.value = ''
  })

  it('preserves the selected project and uses accountId identity for a project-qualified member', () => {
    mockProjectId.value = 'flightctl'
    const member = { name: 'Priya Shah', jiraDisplayName: 'Priya Shah', accountId: 'acc-123' }
    const wrapper = mount(PersonTable, { props: { members: [member], teamKey: 'flightctl::Core' } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('projectId=flightctl')
    expect(href).toContain('accountId=acc-123')
    expect(href).not.toContain('person=')
  })

  it('leaves legacy OSAC uid links unaffected when no project is selected', () => {
    const member = { name: 'Alice Smith', jiraDisplayName: 'Alice Smith', uid: 'asmith' }
    const wrapper = mount(PersonTable, { props: { members: [member] } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('uid=asmith')
    expect(href).not.toContain('projectId=')
  })
})
