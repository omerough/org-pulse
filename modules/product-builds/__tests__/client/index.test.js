import { describe, it, expect } from 'vitest'
import { routes } from '../../client/index.js'

describe('product-builds client routes', () => {
  it('exposes only the osac view', () => {
    expect(Object.keys(routes)).toEqual(['osac'])
  })

  it('does not resolve inherited RHAI/AIPCC view ids', () => {
    const legacyViewIds = [
      'rhaiis',
      'rhel-ai',
      'base-images',
      'builder-images',
      'wheel-collections',
      'package-analysis',
    ]
    for (const viewId of legacyViewIds) {
      expect(routes[viewId]).toBeUndefined()
    }
  })
})
