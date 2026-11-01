import { ref, computed, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useAuth } from './useAuth'
import { useProjectId, projectQuery } from './useProjectId.js'

const allMessages = ref([])
const dismissedIds = ref(new Set())

// Guards against a slow earlier request overwriting a later project's messages.
let fetchSequence = 0

function storageKey(email) {
  return `app_messages_dismissed:${email || 'anonymous'}`
}

function loadDismissed(email) {
  try {
    const raw = sessionStorage.getItem(storageKey(email))
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(email, ids) {
  try {
    sessionStorage.setItem(storageKey(email), JSON.stringify([...ids]))
  } catch {
    // Silently ignore -- alert will reappear but app won't crash
  }
}

export function useMessages() {
  const { user } = useAuth()
  const projectId = useProjectId()

  async function fetchMessages() {
    const requestId = ++fetchSequence
    try {
      const data = await apiRequest(`/messages${projectQuery(projectId.value)}`)
      if (requestId !== fetchSequence) return
      allMessages.value = data.messages || []
    } catch {
      if (requestId !== fetchSequence) return
      allMessages.value = []
    }
    dismissedIds.value = loadDismissed(user.value?.email)
  }

  // Some messages depend on the selected project; never show the previous project's.
  watch(projectId, () => {
    allMessages.value = []
    fetchMessages()
  }, { flush: 'sync' })

  function dismiss(id) {
    dismissedIds.value.add(id)
    dismissedIds.value = new Set(dismissedIds.value) // trigger Vue reactivity
    saveDismissed(user.value?.email, dismissedIds.value)
  }

  const messages = computed(() =>
    allMessages.value.filter(m => !dismissedIds.value.has(m.id))
  )

  return { messages, fetchMessages, dismiss }
}
