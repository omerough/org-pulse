<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  // 'click' (default) keeps the original tap-to-open behavior used by list-row
  // and detail-panel badge tooltips. 'hover' additionally reveals on pointer
  // hover and keyboard focus for desktop, while click/tap still works as the
  // touch/non-hover fallback — used by chart info icons, where hover-to-preview
  // is the expected dashboard interaction.
  trigger: { type: String, default: 'click' }
})

const TOOLTIP_W = 256 // w-64
const GAP = 8

const open = ref(false)
const el = ref(null)
const tooltipStyle = ref({})
const vPos = ref('above')
const arrowLeft = ref('50%')

// Real hover-capable pointer (mouse/trackpad), not touch. Touch browsers can
// synthesize a mouseenter immediately before click when tapping, which would
// otherwise open-then-instantly-close the tooltip via toggle(). Gating only
// the pointer-hover path (not keyboard focus) keeps touch's click fallback
// working while desktop hover and keyboard access are unaffected.
const supportsHoverPointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
  : true

function show() {
  if (!el.value) return
  const rect = el.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2

  // Vertical: prefer above, fall back to below
  const above = rect.top > 100
  vPos.value = above ? 'above' : 'below'

  // Horizontal: center on icon, but clamp to viewport
  let left = centerX - TOOLTIP_W / 2
  left = Math.max(GAP, Math.min(left, window.innerWidth - TOOLTIP_W - GAP))

  // Arrow tracks the icon center relative to the tooltip left edge
  arrowLeft.value = Math.max(12, Math.min(centerX - left, TOOLTIP_W - 12)) + 'px'

  tooltipStyle.value = {
    position: 'fixed',
    left: left + 'px',
    top: above ? (rect.top - GAP) + 'px' : (rect.bottom + GAP) + 'px',
    transform: above ? 'translateY(-100%)' : 'none',
    width: TOOLTIP_W + 'px',
    zIndex: 9999
  }
  open.value = true
}

function hide() {
  open.value = false
}

function toggle(e) {
  e.stopPropagation()
  if (open.value) {
    hide()
    return
  }
  show()
}

function onHoverEnter() {
  if (props.trigger === 'hover' && supportsHoverPointer) show()
}
function onHoverLeave() {
  if (props.trigger === 'hover' && supportsHoverPointer) hide()
}
function onFocusIn() {
  if (props.trigger === 'hover') show()
}
function onFocusOut() {
  if (props.trigger === 'hover') hide()
}

function onClickOutside(e) {
  if (el.value && !el.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <span class="inline-flex" ref="el">
    <button
      @click="toggle"
      @mouseenter="onHoverEnter"
      @mouseleave="onHoverLeave"
      @focus="onFocusIn"
      @blur="onFocusOut"
      class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      aria-label="More info"
    >
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
      </svg>
    </button>
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="open"
          :style="tooltipStyle"
          class="px-3 py-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg"
        >
          <!-- Arrow above tooltip (tooltip is below icon) -->
          <div v-if="vPos === 'below'" class="absolute bottom-full mb-px" :style="{ left: arrowLeft, transform: 'translateX(-50%)' }">
            <div class="w-2 h-2 bg-white dark:bg-gray-700 border-l border-t border-gray-200 dark:border-gray-600 rotate-45 translate-y-1" />
          </div>
          {{ text }}
          <!-- Arrow below tooltip (tooltip is above icon) -->
          <div v-if="vPos === 'above'" class="absolute top-full -mt-px" :style="{ left: arrowLeft, transform: 'translateX(-50%)' }">
            <div class="w-2 h-2 bg-white dark:bg-gray-700 border-r border-b border-gray-200 dark:border-gray-600 rotate-45 -translate-y-1" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
