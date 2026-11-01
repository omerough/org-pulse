import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock apiRequest
vi.mock('@shared/client/services/api', () => ({
  apiRequest: vi.fn()
}))

// Mock useAuth
vi.mock('../composables/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { value: { email: 'test@example.com' } }
  }))
}))

let useMessages

beforeEach(async () => {
  vi.resetModules()

  // Clear sessionStorage
  sessionStorage.clear()
  window.location.hash = ''

  // Re-mock after resetModules
  vi.doMock('@shared/client/services/api', () => ({
    apiRequest: vi.fn()
  }))
  vi.doMock('../composables/useAuth', () => ({
    useAuth: vi.fn(() => ({
      user: { value: { email: 'test@example.com' } }
    }))
  }))

  const mod = await import('../composables/useMessages.js')
  useMessages = mod.useMessages
})

describe('useMessages', () => {
  it('fetchMessages populates reactive message list from API', async () => {
    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [
        { id: 'a', type: 'info', text: 'Hello' },
        { id: 'b', type: 'warning', text: 'Warn' }
      ]
    })

    const { messages, fetchMessages } = useMessages()
    await fetchMessages()

    expect(messages.value).toHaveLength(2)
    expect(messages.value[0].id).toBe('a')
    expect(messages.value[1].id).toBe('b')
  })

  it('dismiss(id) removes message from computed messages', async () => {
    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [
        { id: 'a', type: 'info', text: 'Hello' },
        { id: 'b', type: 'warning', text: 'Warn' }
      ]
    })

    const { messages, fetchMessages, dismiss } = useMessages()
    await fetchMessages()
    expect(messages.value).toHaveLength(2)

    dismiss('a')
    expect(messages.value).toHaveLength(1)
    expect(messages.value[0].id).toBe('b')
  })

  it('persists dismissed IDs to sessionStorage', async () => {
    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [{ id: 'x', type: 'info', text: 'msg' }]
    })

    const { fetchMessages, dismiss } = useMessages()
    await fetchMessages()
    dismiss('x')

    const stored = JSON.parse(sessionStorage.getItem('app_messages_dismissed:test@example.com'))
    expect(stored).toContain('x')
  })

  it('reloads dismissed IDs from sessionStorage on fetchMessages', async () => {
    sessionStorage.setItem('app_messages_dismissed:test@example.com', JSON.stringify(['pre-dismissed']))

    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [{ id: 'pre-dismissed', type: 'info', text: 'old' }]
    })

    const { messages, fetchMessages } = useMessages()
    await fetchMessages()
    expect(messages.value).toHaveLength(0)
  })

  it('does not throw when sessionStorage read fails', async () => {
    // Make sessionStorage.getItem throw
    const orig = sessionStorage.getItem
    sessionStorage.getItem = () => { throw new Error('quota exceeded') }

    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [{ id: 'z', type: 'info', text: 'msg' }]
    })

    const { messages, fetchMessages } = useMessages()
    await fetchMessages()
    // Should still work with empty dismissed set
    expect(messages.value).toHaveLength(1)

    sessionStorage.getItem = orig
  })

  it('does not throw when sessionStorage write fails', async () => {
    const orig = sessionStorage.setItem
    sessionStorage.setItem = () => { throw new Error('quota exceeded') }

    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [{ id: 'z', type: 'info', text: 'msg' }]
    })

    const { messages, fetchMessages, dismiss } = useMessages()
    await fetchMessages()

    // Should not throw
    expect(() => dismiss('z')).not.toThrow()
    // Message should still be dismissed in memory
    expect(messages.value).toHaveLength(0)

    sessionStorage.setItem = orig
  })

  it('storage key is scoped to user email', async () => {
    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockResolvedValue({
      messages: [{ id: 't', type: 'info', text: 'msg' }]
    })

    const { fetchMessages, dismiss } = useMessages()
    await fetchMessages()
    dismiss('t')

    expect(sessionStorage.getItem('app_messages_dismissed:test@example.com')).toBeTruthy()
    expect(sessionStorage.getItem('app_messages_dismissed:other@example.com')).toBeNull()
  })

  it('handles API error gracefully', async () => {
    const { apiRequest: mockApi } = await import('@shared/client/services/api')
    mockApi.mockRejectedValue(new Error('network error'))

    const { messages, fetchMessages } = useMessages()
    await fetchMessages()
    expect(messages.value).toEqual([])
  })

  describe('project context', () => {
    function selectProject(projectId) {
      window.location.hash = projectId ? `#/team-tracker/home?projectId=${projectId}` : '#/team-tracker/home'
      window.dispatchEvent(new Event('urlchange'))
    }

    it('requests /messages unqualified when no project is selected', async () => {
      const { apiRequest: mockApi } = await import('@shared/client/services/api')
      mockApi.mockResolvedValue({ messages: [] })

      await useMessages().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('/messages')
    })

    it('qualifies the request with the selected project', async () => {
      const { apiRequest: mockApi } = await import('@shared/client/services/api')
      mockApi.mockResolvedValue({ messages: [] })
      window.location.hash = '#/team-tracker/home?projectId=osac'

      await useMessages().fetchMessages()

      expect(mockApi).toHaveBeenCalledWith('/messages?projectId=osac')
    })

    it('clears and refetches on switching between project and no-project contexts', async () => {
      const { apiRequest: mockApi } = await import('@shared/client/services/api')
      mockApi.mockResolvedValueOnce({ messages: [{ id: 'legacy-only', type: 'warning', text: 'incomplete' }] })
      const { messages, fetchMessages } = useMessages()
      await fetchMessages()
      expect(messages.value.map(m => m.id)).toEqual(['legacy-only'])

      let resolveProject
      mockApi.mockImplementationOnce(() => new Promise(resolve => { resolveProject = resolve }))
      selectProject('osac')
      expect(messages.value).toEqual([])
      expect(mockApi).toHaveBeenLastCalledWith('/messages?projectId=osac')
      resolveProject({ messages: [{ id: 'shared', type: 'info', text: 'hi' }] })
      await vi.waitFor(() => expect(messages.value.map(m => m.id)).toEqual(['shared']))

      mockApi.mockResolvedValueOnce({ messages: [{ id: 'legacy-only', type: 'warning', text: 'incomplete' }] })
      selectProject('')
      expect(messages.value).toEqual([])
      expect(mockApi).toHaveBeenLastCalledWith('/messages')
      await vi.waitFor(() => expect(messages.value.map(m => m.id)).toEqual(['legacy-only']))
    })

    it('ignores a late response from the previous context', async () => {
      const { apiRequest: mockApi } = await import('@shared/client/services/api')
      let resolveStale
      mockApi.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))
      const { messages, fetchMessages } = useMessages()
      const staleFetch = fetchMessages()

      mockApi.mockResolvedValueOnce({ messages: [{ id: 'project', type: 'info', text: 'p' }] })
      selectProject('osac')
      await vi.waitFor(() => expect(messages.value.map(m => m.id)).toEqual(['project']))

      resolveStale({ messages: [{ id: 'legacy-only', type: 'warning', text: 'incomplete' }] })
      await staleFetch

      expect(messages.value.map(m => m.id)).toEqual(['project'])
    })
  })
})
