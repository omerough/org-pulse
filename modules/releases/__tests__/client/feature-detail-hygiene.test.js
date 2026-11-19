import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({ apiRequest: vi.fn() }))
vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({ navigateTo: vi.fn(), linkTo: vi.fn() })
}))

const feature = ref(null)
vi.mock('../../client/execute/composables/useFeatureTraffic', () => ({
  useFeatureDetail: () => ({ feature, loading: ref(false), error: ref(null), loadFeature: vi.fn() })
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

async function mountDetail() {
  feature.value = null
  const wrapper = mount(FeatureDetailView, {
    global: {
      provide: {
        moduleNav: {
          params: ref({ key: 'FC-1', version: '0.1' }),
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
  feature.value = { key: 'FC-1', summary: 'Feature', fixVersions: ['0.1'] }
  await flushPromises()
  return wrapper
}

describe('FeatureDetailView hygiene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setDefaultProjectId('')
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
})
