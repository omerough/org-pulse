<script setup>
import { ref, watch } from 'vue'
import { Video, Presentation, StickyNote, Play, BookOpen, ExternalLink } from 'lucide-vue-next'
import { getAIImpactEnablementCategories } from '@shared/client/enablement-links.js'
import { useDisabledPipelines } from '../composables/useDisabledPipelines.js'

const { isDisabled } = useDisabledPipelines()

const iconMap = { Video, Presentation, StickyNote, Play, BookOpen }
function resolveIcon(name) { return iconMap[name] || Video }

const enablementCategories = getAIImpactEnablementCategories()

const enablementPipelineMap = {
  'rfe-builder': 'rfe-creator',
  'strat-builder': 'design-review',
  'ai-quality': 'test-plan-review',
  'ai-first-documentation': 'documentation',
  'component-onboarding': 'build-release',
}

const props = defineProps({
  show: { type: Boolean, default: false },
  initialTab: { type: String, default: null }
})

const emit = defineEmits(['close'])

const activeTab = ref('scoring')
const dontShowAgain = ref(false)

watch(() => props.show, (visible) => {
  if (visible && props.initialTab) {
    activeTab.value = props.initialTab
  }
})

function handleClose() {
  emit('close', dontShowAgain.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="handleClose" />

        <!-- Modal -->
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Impact Tools</h2>
            <button
              @click="handleClose"
              class="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-gray-200 dark:border-gray-700 px-6">
            <button
              @click="activeTab = 'scoring'"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
              :class="activeTab === 'scoring'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              PRD Scoring
            </button>
            <button
              @click="!isDisabled('rfe-creator') && (activeTab = 'creator')"
              :disabled="isDisabled('rfe-creator')"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
              :class="isDisabled('rfe-creator')
                ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : activeTab === 'creator'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              RFE Creator
            </button>
            <button
              @click="activeTab = 'features'"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
              :class="activeTab === 'features'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              Design Review
            </button>
            <button
              @click="activeTab = 'testplans'"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
              :class="activeTab === 'testplans'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              Test Plan Review
            </button>
            <button
              @click="activeTab = 'enablement'"
              class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
              :class="activeTab === 'enablement'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              Enablement
            </button>
          </div>

          <!-- Content (scrollable) -->
          <div class="flex-1 overflow-auto px-6 py-5">

            <!-- Scoring Tab -->
            <div v-if="activeTab === 'scoring'" class="space-y-5">
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">How PRD Quality Scoring Works</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  Each PRD is automatically assessed by an AI reviewer that scores how clearly it communicates user-facing intent. Scores range from 0–10 across five criteria (0–2 each). A PRD passes at 7/10 or higher, and any single zero is an automatic fail.
                </p>
              </div>

              <!-- Flow diagram -->
              <div class="flex items-center gap-2 text-xs">
                <span class="px-2.5 py-1.5 rounded-md bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-200 font-medium">PRD Drafted</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-200 font-medium">AI Review</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-green-100 dark:bg-green-800/60 text-green-700 dark:text-green-200 font-medium">Quality Score</span>
              </div>

              <!-- Rubric -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Scoring Criteria</h4>
                <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table class="w-full text-sm">
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100 w-40">What (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Does the PRD clearly describe what users can do or observe, with affected personas and services identified?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Why (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Is there a clear reason this matters — user pain, business need, or strategic goal?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">User-Facing Focus (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Does it describe user-observable outcomes without prescribing implementation? A PRD defines WHAT and WHY, not HOW.</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Right-Sized (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Is it scoped to a coherent set of capabilities, not bundling unrelated work?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Testability (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Can the requirements be verified by a PM or QA engineer using the product?</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- CLI reference -->
              <div class="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">CLI Tools</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  PRDs are drafted with the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">/prd</span> workflow (source: <a href="https://github.com/flightctl/ai-workflows" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">flightctl/ai-workflows</a>) and scored by the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">prd-review</span> skill (source: <a href="https://github.com/osac-project/osac-workspace" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">osac-project/osac-workspace</a>).
                </p>
                <div class="space-y-1.5 text-xs font-mono">
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/prd</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Draft or refine a PRD (What / Why)</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/prd-review</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Score a PRD against the OSAC rubric</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Design Review Tab -->
            <div v-if="activeTab === 'features'" class="space-y-5">
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">How Design Review Works</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  OSAC design documents (<code class="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-xs">design.md</code> in enhancement-proposal PRs) are reviewed by the EP Review GitHub Action, which scores each design against four dimensions using the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">ep-review</span> skill. Every design needs human sign-off — PR approval and merge — before it's considered complete.
                </p>
              </div>

              <!-- Flow diagram -->
              <div class="flex items-center gap-2 text-xs flex-wrap">
                <span class="px-2.5 py-1.5 rounded-md bg-blue-100 dark:bg-blue-800/60 text-blue-700 dark:text-blue-200 font-medium">Design Drafted</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">AI Review</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-green-100 dark:bg-green-800/60 text-green-700 dark:text-green-200 font-medium">Design Score</span>
              </div>

              <!-- Scoring -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">AI Scoring Dimensions</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Each design is scored 0–2 on four dimensions, for a total of 0–8. A design passes at 5/8 or higher, and any single zero is an automatic fail.
                </p>
                <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table class="w-full text-sm">
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100 w-28">Architecture (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Are the technical decisions sound and consistent with OSAC patterns?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Feasibility (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Is the implementation realistic, specific, and proportional to the scope?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Scope (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Is the design right-sized with clear boundaries, covering relevant personas and dimensions?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Testability (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Does it describe a concrete test strategy that would catch regressions?</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- What to do -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">What Should I Do?</h4>
                <div class="space-y-3">
                  <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Needs Revision</span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                      The AI review scored the design below 5/8 or gave a zero on a dimension. Update the <code class="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-xs">design.md</code> in your enhancement-proposal PR and push the change, then add the <code class="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-xs">re-review</code> label to trigger another review.
                    </p>
                  </div>
                  <div class="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 p-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">Awaiting Sign-off</span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                      The design passed AI review (5/8 or higher with no zeros) but no human has signed off yet. Review the <code class="px-1 py-0.5 rounded bg-yellow-100 dark:bg-yellow-800/40 text-xs">design.md</code> in the PR; if it looks good, approve and merge the enhancement-proposal PR.
                    </p>
                  </div>
                  <div class="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Approved</span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300">
                      The design PR has been approved and merged by a human engineer. No further action needed.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Status badges -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">AI Verdict Badges</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Pass</span>
                    <span class="text-gray-600 dark:text-gray-300">Total 5/8 or higher with no zeros — ready for human sign-off</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">Fail</span>
                    <span class="text-gray-600 dark:text-gray-300">Below 5/8 or a zero on any dimension — design needs revision</span>
                  </div>
                </div>
              </div>

              <!-- CLI reference -->
              <div class="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">CLI Tools</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Designs are authored with the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">/design</span> workflow (source: <a href="https://github.com/flightctl/ai-workflows" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">flightctl/ai-workflows</a>) and scored by the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">ep-review</span> skill (source: <a href="https://github.com/osac-project/osac-workspace" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">osac-project/osac-workspace</a>).
                </p>
                <div class="space-y-1.5 text-xs font-mono">
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/design</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Draft or refine a design document (How)</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/ep-review</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Score a design against the OSAC rubric</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Test Plan Review Tab -->
            <div v-if="activeTab === 'testplans'" class="space-y-5">
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">How Test Plan Review Works</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  After a design is approved and decomposed, a structured test plan is auto-generated for each feature. The <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">test-plan-review</span> skill scores the plan on five dimensions. Plans that pass proceed to test case generation and implementation.
                </p>
              </div>

              <!-- Flow diagram -->
              <div class="flex items-center gap-2 text-xs flex-wrap">
                <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">Design Approved</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">Decompose</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">AI Review</span>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                <span class="px-2.5 py-1.5 rounded-md bg-green-100 dark:bg-green-800/60 text-green-700 dark:text-green-200 font-medium">Quality Score</span>
              </div>

              <!-- Scoring -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Scoring Criteria</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Each test plan is scored 0–2 on five criteria, for a total of 0–10. Verdicts: Ready (&ge;8), Revise (6–7), Rework (&lt;6).
                </p>
                <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table class="w-full text-sm">
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100 w-32">Specificity (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Is the plan concrete and feature-specific, not generic boilerplate?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Grounding (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Are all findings traceable to the PRD and design documents?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Scope Fidelity (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Does the test scope align with the feature's boundaries?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Actionability (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Can QE start testing immediately from this plan?</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">Consistency (0–2)</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Do all sections align internally (priorities, endpoints, coverage)?</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Verdicts -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Verdict Outcomes</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Ready</span>
                    <span class="text-gray-600 dark:text-gray-300">Score &ge;8 — proceed to test case generation and implementation</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Revise</span>
                    <span class="text-gray-600 dark:text-gray-300">Score 6–7 — some criteria need improvement before proceeding</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">Rework</span>
                    <span class="text-gray-600 dark:text-gray-300">Score &lt;6 — significant gaps, revisit the design or provide additional context</span>
                  </div>
                </div>
              </div>

              <!-- CLI reference -->
              <div class="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">CLI Tools</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Test plans are auto-generated during the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">/decompose</span> phase and scored by the <span class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded">test-plan-review</span> skill (source: <a href="https://github.com/osac-project/osac-workspace" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">osac-project/osac-workspace</a>).
                </p>
                <div class="space-y-1.5 text-xs font-mono">
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/decompose</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Break a design into epics, stories, and test plans</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/e2e</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Generate and run end-to-end tests from a test plan</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Enablement Tab -->
            <div v-if="activeTab === 'enablement'" class="space-y-5">
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">How the OSAC Agentic SDLC Works</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  The OSAC Agentic SDLC drives a feature from PRD through design, implementation, and testing using Claude Code skills. The presentation and workflow guide below walk through the full flow.
                </p>
              </div>

              <!-- Workflow commands -->
              <div class="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Workflow Commands</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  The Agentic SDLC workflows are installed from <a href="https://github.com/flightctl/ai-workflows" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline">flightctl/ai-workflows</a>.
                </p>
                <div class="space-y-1.5 text-xs font-mono">
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/prd</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Draft &amp; refine a PRD (What / Why)</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/design</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Author the design document (How)</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/implement</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Plan &amp; write the implementation with tests</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <code class="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 whitespace-nowrap">/e2e</code>
                    <span class="text-gray-500 dark:text-gray-400 font-sans pt-0.5">Generate &amp; run end-to-end tests</span>
                  </div>
                </div>
              </div>

              <div v-for="cat in enablementCategories" :key="cat.id" class="space-y-3">
                <div class="flex items-center gap-2">
                  <h4
                    class="text-sm font-semibold"
                    :class="isDisabled(enablementPipelineMap[cat.id]) ? 'text-gray-300 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'"
                  >{{ cat.title }}</h4>
                  <span
                    v-if="isDisabled(enablementPipelineMap[cat.id])"
                    class="text-xs text-gray-300 dark:text-gray-600"
                  >Not active</span>
                  <a
                    v-else-if="cat.slackChannel"
                    :href="cat.slackChannel.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {{ cat.slackChannel.name }}
                  </a>
                </div>
                <div class="flex flex-wrap gap-3">
                  <component
                    :is="isDisabled(enablementPipelineMap[cat.id]) ? 'span' : 'a'"
                    v-for="link in cat.links"
                    :key="link.url"
                    v-bind="isDisabled(enablementPipelineMap[cat.id]) ? {} : { href: link.url, target: '_blank', rel: 'noopener noreferrer' }"
                    class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200"
                    :class="isDisabled(enablementPipelineMap[cat.id])
                      ? 'border-gray-100 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/30 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500'"
                  >
                    <component :is="resolveIcon(link.icon)" :size="16" :stroke-width="1.7" class="flex-shrink-0" :class="isDisabled(enablementPipelineMap[cat.id]) ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'" />
                    <span>{{ link.label }}</span>
                    <ExternalLink v-if="!isDisabled(enablementPipelineMap[cat.id])" :size="12" class="flex-shrink-0 text-gray-400 dark:text-gray-500" />
                  </component>
                </div>
              </div>

              <div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
                <p class="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Looking for more?</strong> The full set of enablement materials (including Jira Autofix, Agent Eval Harness, and more) is available in the global <strong>About → Docs</strong> tab.
                </p>
              </div>
            </div>

            <!-- Creator Tab -->
            <div v-if="activeTab === 'creator'" class="space-y-5">
              <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">RFE Creator</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  The RFE Creator is an AI-powered toolkit for the full RFE lifecycle — from initial idea through submission to Jira. It builds on the quality scoring rubric to ensure every RFE meets quality standards before submission.
                </p>
              </div>

              <!-- Workflow -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Workflow</h4>
                <div class="flex items-center gap-2 text-xs flex-wrap">
                  <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">Create</span>
                  <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">Review</span>
                  <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  <span class="px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-800/60 text-purple-700 dark:text-purple-200 font-medium">Auto-Fix</span>
                  <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                  <span class="px-2.5 py-1.5 rounded-md bg-green-100 dark:bg-green-800/60 text-green-700 dark:text-green-200 font-medium">Submit</span>
                </div>
              </div>

              <!-- Key skills -->
              <div>
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Available Skills</h4>
                <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table class="w-full text-sm">
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.create</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Write a new RFE from a problem statement or idea</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.review</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Review and improve existing RFEs by Jira key</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.auto-fix</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Batch review and fix RFEs automatically via JQL</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.split</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Split oversized RFEs into right-sized pieces</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.submit</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">Submit or update RFEs in Jira</td>
                      </tr>
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-2.5 font-mono text-xs text-purple-600 dark:text-purple-400 whitespace-nowrap">/rfe.speedrun</td>
                        <td class="px-4 py-2.5 text-gray-600 dark:text-gray-300">End-to-end pipeline: create, review, fix, and submit</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Install -->
              <div class="rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 px-4 py-3">
                <h4 class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">Installation</h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  Both plugins are available from the <a href="https://github.com/opendatahub-io/skills-registry" target="_blank" rel="noopener noreferrer" class="font-mono text-xs bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-blue-600 dark:text-blue-400 hover:underline">opendatahub-skills</a> registry. Install them in Claude Code:
                </p>
                <div class="space-y-2 text-xs font-mono">
                  <div>
                    <p class="text-gray-500 dark:text-gray-400 font-sans text-xs mb-1">Quality scoring (assess-rfe):</p>
                    <code class="block px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200">/plugin install assess-rfe@opendatahub-skills</code>
                  </div>
                  <div>
                    <p class="text-gray-500 dark:text-gray-400 font-sans text-xs mb-1">Full RFE lifecycle (rfe-creator):</p>
                    <code class="block px-3 py-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200">/plugin install rfe-creator@opendatahub-skills</code>
                  </div>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Source: <a href="https://github.com/opendatahub-io/assess-rfe" target="_blank" rel="noopener noreferrer" class="font-mono text-blue-600 dark:text-blue-400 hover:underline">opendatahub-io/assess-rfe</a> and <a href="https://github.com/jwforres/rfe-creator" target="_blank" rel="noopener noreferrer" class="font-mono text-blue-600 dark:text-blue-400 hover:underline">jwforres/rfe-creator</a>
                </p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                v-model="dontShowAgain"
                type="checkbox"
                class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
              />
              <span class="text-sm text-gray-500 dark:text-gray-400">Don't show this again</span>
            </label>
            <button
              @click="handleClose"
              class="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .relative {
  transform: scale(0.95);
}
</style>
