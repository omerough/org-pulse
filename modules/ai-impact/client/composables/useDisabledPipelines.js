const DISABLED_PIPELINES = ['documentation', 'build-release', 'rfe-creator']

export function useDisabledPipelines() {
  function isDisabled(pipelineId) {
    return DISABLED_PIPELINES.includes(pipelineId)
  }

  return { isDisabled }
}
