import { describe, it, expect } from 'vitest'
import {
  UNASSIGNED_COMPONENT,
  UNKNOWN_STATUS,
  collectComponentOptions,
  collectStatusOptions,
  matchesComponents,
  matchesStatus,
  useComponentStatusFilter
} from '../../../client/execute/composables/useComponentStatusFilter'

describe('collectComponentOptions', () => {
  it('sorts real component names and appends the Unassigned sentinel last', () => {
    const items = [{ components: ['Zeta'] }, { components: [] }, { components: ['Alpha', 'Zeta'] }]
    expect(collectComponentOptions(items, i => i.components)).toEqual(['Alpha', 'Zeta', UNASSIGNED_COMPONENT])
  })

  it('omits the sentinel when every item has a component', () => {
    const items = [{ components: ['Alpha'] }]
    expect(collectComponentOptions(items, i => i.components)).toEqual(['Alpha'])
  })
})

describe('collectStatusOptions', () => {
  it('sorts statuses and appends the Unknown sentinel last for missing values', () => {
    const items = [{ status: 'To Do' }, { status: null }, { status: 'Done' }]
    expect(collectStatusOptions(items, i => i.status)).toEqual(['Done', 'To Do', UNKNOWN_STATUS])
  })
})

describe('matchesComponents', () => {
  it('matches when no filter is selected', () => {
    expect(matchesComponents(['Alpha'], [])).toBe(true)
    expect(matchesComponents([], [])).toBe(true)
  })

  it('matches a multi-component item when ANY selected component overlaps (OR semantics)', () => {
    expect(matchesComponents(['Alpha', 'Beta'], ['Beta', 'Gamma'])).toBe(true)
  })

  it('rejects when none of the components overlap', () => {
    expect(matchesComponents(['Alpha'], ['Gamma'])).toBe(false)
  })

  it('matches missing/empty components only via the Unassigned sentinel', () => {
    expect(matchesComponents([], [UNASSIGNED_COMPONENT])).toBe(true)
    expect(matchesComponents(null, [UNASSIGNED_COMPONENT])).toBe(true)
    expect(matchesComponents([], ['Alpha'])).toBe(false)
  })
})

describe('matchesStatus', () => {
  it('matches when no filter is selected', () => {
    expect(matchesStatus('Done', [])).toBe(true)
  })

  it('matches a missing status only via the Unknown sentinel', () => {
    expect(matchesStatus(null, [UNKNOWN_STATUS])).toBe(true)
    expect(matchesStatus('', [UNKNOWN_STATUS])).toBe(true)
    expect(matchesStatus(null, ['Done'])).toBe(false)
  })

  it('matches an exact status value', () => {
    expect(matchesStatus('Done', ['Done', 'To Do'])).toBe(true)
    expect(matchesStatus('Review', ['Done'])).toBe(false)
  })
})

describe('useComponentStatusFilter', () => {
  it('toggles selections independently and reports isFiltered', () => {
    const f = useComponentStatusFilter()
    expect(f.isFiltered.value).toBe(false)

    f.toggleComponent('Alpha')
    expect(f.selectedComponents.value).toEqual(['Alpha'])
    expect(f.isFiltered.value).toBe(true)

    f.toggleStatus('Done')
    expect(f.selectedStatuses.value).toEqual(['Done'])

    f.toggleComponent('Alpha')
    expect(f.selectedComponents.value).toEqual([])
    expect(f.isFiltered.value).toBe(true)

    f.clearFilters()
    expect(f.selectedComponents.value).toEqual([])
    expect(f.selectedStatuses.value).toEqual([])
    expect(f.isFiltered.value).toBe(false)
  })
})
