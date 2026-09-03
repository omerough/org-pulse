import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/**
 * Reactive dark-mode flag driven by the `dark` class on `<html>`, plus
 * Chart.js-ready text/grid colors that stay readable in both themes.
 * Used by any component rendering Chart.js charts outside Tailwind's
 * `dark:` utility classes (canvas content isn't reachable by CSS).
 */
export function useDarkMode() {
  const isDark = ref(false)
  let observer = null

  onMounted(() => {
    isDark.value = document.documentElement.classList.contains('dark') ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    observer = new MutationObserver(() => {
      isDark.value = document.documentElement.classList.contains('dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  })

  onBeforeUnmount(() => observer?.disconnect())

  const textColor = computed(() => isDark.value ? 'rgba(209, 213, 219, 1)' : 'rgba(107, 114, 128, 1)')
  const gridColor = computed(() => isDark.value ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 1)')
  // Matches the chart card's own background (bg-white / dark:bg-gray-800), for
  // Chart.js elements that need to visually "punch through" gridlines — e.g. a
  // hollow point marker whose fill must read as a ring, not a solid dot.
  const cardBackground = computed(() => isDark.value ? '#1f2937' : '#ffffff')

  return { isDark, textColor, gridColor, cardBackground }
}
