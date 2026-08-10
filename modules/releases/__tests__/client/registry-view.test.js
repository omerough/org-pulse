import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ isAdmin: ref(true), roles: ref([]) })
}))

import { apiRequest } from '@shared/client/services/api.js'
import RegistryView from '../../client/views/RegistryView.vue'

function makeRelease(id, overrides = {}) {
  return {
    id,
    displayName: id.toUpperCase(),
    state: 'active',
    source: 'jira',
    milestones: {},
    ...overrides
  }
}

function mountView() {
  return mount(RegistryView, {
    global: {
      provide: {
        moduleNav: {
          navigateTo: vi.fn(),
          goBack: vi.fn(),
          updateParams: vi.fn(),
          params: ref({})
        }
      }
    }
  })
}

describe('RegistryView source badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('labels a jira-sourced release as "Jira", not "Manual"', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'jira' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Jira')
    expect(wrapper.text()).not.toContain('Manual')
  })

  it('still labels a product-pages release as "Product Pages"', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'product-pages' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Product Pages')
  })

  it('falls back to "Manual" only for a truly unrecognized source', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'something-else' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Manual')
  })
})
