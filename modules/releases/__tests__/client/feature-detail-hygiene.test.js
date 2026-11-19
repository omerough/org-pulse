import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({ apiRequest: vi.fn() }))
vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({ navigateTo: vi.fn(), linkTo: vi.fn() })
}))

const feature = ref(null)
const loadFeature = vi.fn()
vi.mock('../../client/execute/composables/useFeatureTraffic', () => ({
  useFeatureDetail: () => ({ feature, loading: ref(false), error: ref(null), loadFeature })
}))
vi.mock('../../client/execute/composables/useAIReview.js', () => ({
  useAIReview: () => ({
    aiReview: ref(null),
    aiReviewLoading: ref(false),
    aiReviewError: ref(null),
    loadAIReview: vi.fn()
  })
}))

import { apiRequest } from '@shared/client/services/api.js'
import { setDefaultProjectId } from '@shared/client/composables/useProjectId.js'
import FeatureDetailView from '../../client/views/FeatureDetailView.vue'

let params
// The project context is a shared singleton, so every wrapper must be unmounted.
const mounted = []

async function mountDetail() {
  feature.value = null
  params = ref({ key: 'FC-1', version: '0.1' })
  const wrapper = mount(FeatureDetailView, {
    global: {
      provide: {
        moduleNav: {
          params,
          updateParams: vi.fn(),
          navigateTo: vi.fn()
        }
      },
      stubs: {
        StatusBadge: true,
        TrafficMap: true,
        EpicBreakdown: true,
        SignoffSection: true,
        AIReviewSection: true,
        HygieneViolations: true
      }
    }
  })
  mounted.push(wrapper)
  feature.value = { key: 'FC-1', summary: 'Feature', fixVersions: ['0.1'] }
  await flushPromises()
  return wrapper
}

describe('FeatureDetailView hygiene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultProjectId('')
  })

  afterEach(() => {
    mounted.splice(0).forEach(wrapper => wrapper.unmount())
  })

  it('requests hygiene for the selected project', async () => {
    setDefaultProjectId('flightctl')
    apiRequest.mockResolvedValue({ features: {} })
    await mountDetail()
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.1&projectId=flightctl')
  })

  it('shows "All clear" when hygiene data exists and the feature has no violations', async () => {
    setDefaultProjectId('osac')
    apiRequest.mockResolvedValue({ features: { 'FC-1': { violations: [] } } })
    const wrapper = await mountDetail()
    expect(wrapper.text()).toContain('All clear')
  })

  it('hides the hygiene section when the project has no hygiene data', async () => {
    setDefaultProjectId('flightctl')
    apiRequest.mockResolvedValue({ state: 'unavailable', features: {} })
    const wrapper = await mountDetail()
    expect(wrapper.text()).not.toContain('Hygiene')
    expect(wrapper.text()).not.toContain('All clear')
  })

  describe('when the selection changes while the view stays mounted', () => {
    const violation = { id: 'missing-assignee', name: 'Missing assignee' }

    it('reloads for the new project and ignores a late response from the previous one', async () => {
      setDefaultProjectId('osac')
      let resolveOsac
      apiRequest.mockReturnValueOnce(new Promise(resolve => { resolveOsac = resolve }))
      const wrapper = await mountDetail()

      setDefaultProjectId('flightctl')
      apiRequest.mockResolvedValueOnce({ state: 'unavailable', features: {} })
      await flushPromises()
      expect(loadFeature).toHaveBeenCalledTimes(2)
      feature.value = { key: 'FC-1', summary: 'Feature', fixVersions: ['0.1'] }
      await flushPromises()

      resolveOsac({ features: { 'FC-1': { violations: [violation] } } })
      await flushPromises()

      expect(apiRequest).toHaveBeenLastCalledWith('/modules/releases/hygiene/features?version=0.1&projectId=flightctl')
      expect(wrapper.text()).not.toContain('violation')
      expect(wrapper.text()).not.toContain('Hygiene')
    })

    it('drops the previous feature’s violations when hygiene is unavailable for the next one', async () => {
      setDefaultProjectId('osac')
      apiRequest.mockResolvedValueOnce({ features: { 'FC-1': { violations: [violation] } } })
      const wrapper = await mountDetail()
      expect(wrapper.text()).toContain('1 violation')

      apiRequest.mockRejectedValueOnce(new Error('boom'))
      params.value = { key: 'FC-2', version: '0.1' }
      await flushPromises()
      feature.value = { key: 'FC-2', summary: 'Other', fixVersions: ['0.1'] }
      await flushPromises()

      expect(loadFeature).toHaveBeenLastCalledWith('FC-2')
      expect(wrapper.text()).not.toContain('violation')
      expect(wrapper.text()).not.toContain('All clear')
    })
  })
})
