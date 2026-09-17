import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { mount, flushPromises } from '@vue/test-utils'
import OsacBuildsView from '../../client/views/OsacBuildsView.vue'
import { apiRequest } from '@shared/client/services/api.js'

function makeBuild(overrides = {}) {
  return {
    runId: 1,
    runUrl: 'https://github.com/osac-project/osac/actions/runs/1',
    mode: 'nightly',
    version: '0.0.10-nightly.1',
    publishedAt: '2026-09-16T03:41:07Z',
    e2eSkipped: false,
    charts: [{ name: 'osac', version: '0.0.10-nightly.1' }],
    images: ['ghcr.io/osac-project/osac-ui:sha-abc'],
    ...overrides
  }
}

async function mountView() {
  const wrapper = mount(OsacBuildsView)
  await flushPromises()
  return wrapper
}

describe('OsacBuildsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the latest build and its charts/images', async () => {
    apiRequest.mockResolvedValue({ builds: [makeBuild()] })
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Nightly')
    expect(wrapper.text()).toContain('0.0.10-nightly.1')
    expect(wrapper.text()).toContain('osac')
    expect(wrapper.text()).toContain('ghcr.io/osac-project/osac-ui:sha-abc')
    expect(wrapper.find('a[href="https://github.com/osac-project/osac/actions/runs/1"]').exists()).toBe(true)
  })

  it('shows the E2E skipped badge only when e2eSkipped is true', async () => {
    apiRequest.mockResolvedValue({ builds: [makeBuild({ e2eSkipped: true })] })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('E2E skipped')
  })

  it('does not show the E2E skipped badge when e2eSkipped is false', async () => {
    apiRequest.mockResolvedValue({ builds: [makeBuild({ e2eSkipped: false })] })
    const wrapper = await mountView()
    expect(wrapper.text()).not.toContain('E2E skipped')
  })

  it('renders previous builds under history and expands on click', async () => {
    const latest = makeBuild({ runId: 2, version: '0.0.11-nightly.1', publishedAt: '2026-09-17T00:00:00Z' })
    const older = makeBuild({ runId: 1, version: '0.0.10-nightly.1', publishedAt: '2026-09-16T00:00:00Z' })
    apiRequest.mockResolvedValue({ builds: [older, latest] })
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('0.0.11-nightly.1')
    const historyRow = wrapper.findAll('[class*="cursor-pointer"]')[0]
    expect(wrapper.text()).toContain('0.0.10-nightly.1')
    expect(wrapper.text().indexOf('No charts published.')).toBe(-1)

    await historyRow.trigger('click')
    expect(wrapper.text()).toContain('osac')
  })

  it('shows an empty state when there are no builds', async () => {
    apiRequest.mockResolvedValue({ builds: [] })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No builds published yet.')
  })

  it('shows an error state when the request fails', async () => {
    apiRequest.mockRejectedValue(new Error('boom'))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('boom')
  })

  it('shows a placeholder when charts or images are empty', async () => {
    apiRequest.mockResolvedValue({ builds: [makeBuild({ charts: [], images: [] })] })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No charts published.')
    expect(wrapper.text()).toContain('No images published.')
  })
})
