import { describe, it, expect } from 'vitest'
import { getTotalScoreClass } from '../../client/utils/feature-helpers.js'

describe('getTotalScoreClass', () => {
  it('renders a perfect 8/8 total as green', () => {
    expect(getTotalScoreClass(8)).toContain('text-green-600')
  })

  it('renders 4-7 out of 8 as amber, not red', () => {
    expect(getTotalScoreClass(4)).toContain('text-amber-600')
    expect(getTotalScoreClass(5)).toContain('text-amber-600')
    expect(getTotalScoreClass(6)).toContain('text-amber-600')
    expect(getTotalScoreClass(7)).toContain('text-amber-600')
  })

  it('renders 0-3 out of 8 as red', () => {
    expect(getTotalScoreClass(0)).toContain('text-red-600')
    expect(getTotalScoreClass(3)).toContain('text-red-600')
  })
})
