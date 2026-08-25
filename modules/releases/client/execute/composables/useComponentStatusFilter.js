import { ref, computed } from 'vue'

export const UNASSIGNED_COMPONENT = 'Unassigned'
export const UNKNOWN_STATUS = 'Unknown'

// Display-only readability fixes for raw Jira Component values. The raw value
// (map key) stays the contract used for filtering/matching; only the rendered
// label changes.
const COMPONENT_DISPLAY_LABELS = {
  'Connectivity&Fabric': 'Connectivity & Fabric'
}

export function componentDisplayLabel(raw) {
  return COMPONENT_DISPLAY_LABELS[raw] || raw
}

export function collectComponentOptions(items, getComponents) {
  const set = new Set()
  for (const item of items) {
    const comps = getComponents(item)
    if (!comps || comps.length === 0) set.add(UNASSIGNED_COMPONENT)
    else for (const c of comps) set.add(c)
  }
  const sorted = [...set].filter(c => c !== UNASSIGNED_COMPONENT).sort()
  if (set.has(UNASSIGNED_COMPONENT)) sorted.push(UNASSIGNED_COMPONENT)
  return sorted
}

export function collectStatusOptions(items, getStatus) {
  const set = new Set()
  for (const item of items) {
    set.add(getStatus(item) || UNKNOWN_STATUS)
  }
  const sorted = [...set].filter(s => s !== UNKNOWN_STATUS).sort()
  if (set.has(UNKNOWN_STATUS)) sorted.push(UNKNOWN_STATUS)
  return sorted
}

// Multi-component items match when ANY selected Component overlaps (OR semantics).
export function matchesComponents(components, selected) {
  if (!selected || selected.length === 0) return true
  if (!components || components.length === 0) return selected.includes(UNASSIGNED_COMPONENT)
  return components.some(c => selected.includes(c))
}

export function matchesStatus(status, selected) {
  if (!selected || selected.length === 0) return true
  return selected.includes(status || UNKNOWN_STATUS)
}

export function useComponentStatusFilter() {
  const selectedComponents = ref([])
  const selectedStatuses = ref([])

  function toggleComponent(value) {
    const idx = selectedComponents.value.indexOf(value)
    if (idx >= 0) selectedComponents.value.splice(idx, 1)
    else selectedComponents.value.push(value)
  }

  function toggleStatus(value) {
    const idx = selectedStatuses.value.indexOf(value)
    if (idx >= 0) selectedStatuses.value.splice(idx, 1)
    else selectedStatuses.value.push(value)
  }

  function clearFilters() {
    selectedComponents.value = []
    selectedStatuses.value = []
  }

  const isFiltered = computed(() => selectedComponents.value.length > 0 || selectedStatuses.value.length > 0)

  return {
    selectedComponents,
    selectedStatuses,
    toggleComponent,
    toggleStatus,
    clearFilters,
    isFiltered
  }
}
