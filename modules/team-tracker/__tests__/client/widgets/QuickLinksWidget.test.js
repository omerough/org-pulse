import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import QuickLinksWidget from '../../../client/widgets/QuickLinksWidget.vue'

const mockNavigateTo = vi.fn()
const mockIsManager = ref(false)
const mockProjectId = ref('flight-control')

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    navigateTo: mockNavigateTo,
    linkTo: vi.fn()
  })
}))

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({ isManager: mockIsManager })
}))

vi.mock('@shared/client/composables/useProjectId', async () => {
  const actual = await vi.importActual('@shared/client/composables/useProjectId')
  return { ...actual, useProjectId: () => mockProjectId }
})

beforeEach(() => {
  mockNavigateTo.mockClear()
  mockIsManager.value = false
  mockProjectId.value = 'flight-control'
})

describe('QuickLinksWidget', () => {
  it.each(['half', 'full'])('mounts with size %s and renders header', (size) => {
    const wrapper = mount(QuickLinksWidget, { props: { size } })
    expect(wrapper.text()).toContain('Quick Links')
  })

  it('renders only non-manager links for non-managers', () => {
    const wrapper = mount(QuickLinksWidget, { props: { size: 'half' } })
    expect(wrapper.text()).not.toContain('My Teams')
    expect(wrapper.text()).not.toContain('View your full manager dashboard')
    expect(wrapper.text()).toContain('Team Directory')
    expect(wrapper.text()).toContain('Browse all teams and people')
    expect(wrapper.text()).toContain('People')
    expect(wrapper.text()).toContain('Search the people registry')
    expect(wrapper.findAll('svg').length).toBe(2)
  })

  it('renders all links including My Teams for managers', () => {
    mockIsManager.value = true
    const wrapper = mount(QuickLinksWidget, { props: { size: 'half' } })
    expect(wrapper.text()).toContain('My Teams')
    expect(wrapper.text()).toContain('Team Directory')
    expect(wrapper.text()).toContain('People')
    expect(wrapper.findAll('svg').length).toBe(3)
  })

  describe.each(['flight-control', 'osac'])('in project context %s', (projectId) => {
    beforeEach(() => {
      mockProjectId.value = projectId
    })

    it.each([
      ['Team Directory', 'home'],
      ['People', 'people']
    ])('keeps the project on the %s link', async (label, viewId) => {
      const wrapper = mount(QuickLinksWidget, { props: { size: 'half' } })
      await wrapper.findAll('button').find(b => b.text().includes(label)).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', viewId, { projectId, from: 'sotu' })
    })

    it('shows My Teams from project permissions and keeps the project on its link', async () => {
      mockIsManager.value = true
      const wrapper = mount(QuickLinksWidget, { props: { size: 'half' } })
      await wrapper.findAll('button').find(b => b.text().includes('My Teams')).trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'manager-dashboard', { projectId, from: 'sotu' })
    })
  })

  it('follows the selected project when it changes', async () => {
    mockIsManager.value = true
    const wrapper = mount(QuickLinksWidget, { props: { size: 'half' } })
    mockProjectId.value = 'osac'
    mockIsManager.value = false
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('My Teams')
    await wrapper.findAll('button').find(b => b.text().includes('People')).trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'people', { projectId: 'osac', from: 'sotu' })
  })
})
