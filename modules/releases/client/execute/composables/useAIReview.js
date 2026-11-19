import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useAIReview() {
  const aiReview = ref(null)
  const aiReviewLoading = ref(false)
  const aiReviewError = ref(null)
  const projectId = useProjectId()

  // Only the latest request, for the project it was issued under, may write state.
  let latestRequestId = 0

  async function loadAIReview(featureKey) {
    const requestId = ++latestRequestId
    const requestedProjectId = projectId.value
    const isCurrent = () => requestId === latestRequestId && projectId.value === requestedProjectId

    aiReviewLoading.value = true
    aiReviewError.value = null
    aiReview.value = null

    try {
      /* eslint-disable org-pulse/no-cross-module-imports -- graceful degradation: 404 when ai-impact is absent */
      const data = await apiRequest(
        `/modules/ai-impact/features/${encodeURIComponent(featureKey)}${projectQuery(requestedProjectId)}`
      )
      /* eslint-enable org-pulse/no-cross-module-imports */
      if (!isCurrent()) return
      // A project without its own published reviews answers 200 `unavailable`; that is "no review".
      aiReview.value = data?.state === 'unavailable' ? null : data
    } catch (e) {
      if (!isCurrent()) return
      // 404 = no AI Impact data for this feature (expected).
      // Also handles the case where the AI Impact module is disabled —
      // when disabled, its routes are not mounted (module-loader.js:194)
      // and Express returns a default 404. apiRequest sets e.status on
      // the Error object in both cases.
      if (e.status !== 404) {
        aiReviewError.value = e.message
      }
    } finally {
      if (isCurrent()) aiReviewLoading.value = false
    }
  }

  return { aiReview, aiReviewLoading, aiReviewError, loadAIReview }
}
