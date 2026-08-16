import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'

const releases = ref([])
const trackingData = ref(null)
const loading = ref(false)
const error = ref(null)

export function useFeatureTracking() {
  async function loadReleases() {
    try {
      var data = await apiRequest('/modules/releases/execution/tracking/releases')
      releases.value = data.releases || []
      error.value = null
    } catch (err) {
      releases.value = []
      error.value = err.message
    }
  }

  async function loadTrackingData(releaseId) {
    loading.value = true
    error.value = null

    try {
      var url = '/modules/releases/execution/tracking/data?releaseId=' + encodeURIComponent(releaseId)
      var data = await apiRequest(url)
      trackingData.value = data
      return data
    } catch (err) {
      error.value = err.message
      trackingData.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    releases,
    trackingData,
    loading,
    error,
    loadReleases,
    loadTrackingData
  }
}
