import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PersonCard from '../../client/components/PersonCard.vue'

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    visibleFields: ref([]),
    primaryDisplayField: ref(null),
    managerNames: ref({ mgr1: 'Manager One' })
  })
}))

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({ getContributions: () => null })
}))

function makeMember(overrides = {}) {
  return {
    name: 'Alice Chen',
    uid: 'alice',
    title: 'Engineer',
    manager: null,
    managerUid: null,
    githubUsername: null,
    gitlabUsername: null,
    customFields: {},
    ...overrides
  }
}

describe('PersonCard manager display', () => {
  it('resolves managerUid when member has managerUid but no legacy manager field', () => {
    const wrapper = mount(PersonCard, {
      props: { member: makeMember({ managerUid: 'mgr1', manager: null }) }
    })
    const mgrLine = wrapper.find('p')
    expect(mgrLine.text()).toContain('Manager One')
  })

  it('falls back to manager field when managerUid is absent', () => {
    const wrapper = mount(PersonCard, {
      props: { member: makeMember({ manager: 'mgr1' }) }
    })
    expect(wrapper.text()).toContain('Manager One')
  })

  it('shows raw UID when manager is not in managerNames', () => {
    const wrapper = mount(PersonCard, {
      props: { member: makeMember({ managerUid: 'unknown_mgr' }) }
    })
    expect(wrapper.text()).toContain('unknown_mgr')
  })

  it('hides manager line when neither managerUid nor manager is set', () => {
    const wrapper = mount(PersonCard, {
      props: { member: makeMember() }
    })
    expect(wrapper.text()).not.toContain('Mgr:')
  })
})
