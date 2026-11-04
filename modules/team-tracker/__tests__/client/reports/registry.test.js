import { describe, it, expect } from 'vitest'
import { reports } from '../../../client/reports/registry'

describe('Report Registry', () => {
  it('has at least one report', () => {
    expect(reports.length).toBeGreaterThan(0)
  })

  it('all entries have required fields', () => {
    for (const report of reports) {
      expect(report).toHaveProperty('id')
      expect(report).toHaveProperty('title')
      expect(report).toHaveProperty('description')
      expect(report).toHaveProperty('icon')
      expect(report).toHaveProperty('tags')
      expect(report).toHaveProperty('component')
      expect(report).toHaveProperty('filters')
      expect(typeof report.id).toBe('string')
      expect(typeof report.title).toBe('string')
      expect(typeof report.description).toBe('string')
      expect(typeof report.icon).toBe('string')
      expect(Array.isArray(report.tags)).toBe(true)
      expect(typeof report.component).toBe('function')
      expect(Array.isArray(report.filters)).toBe(true)
    }
  })

  it('all IDs are unique', () => {
    const ids = reports.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains the project-aware reports and no org-scoped allocation report', () => {
    const ids = reports.map(r => r.id)
    expect(ids).toEqual(['trends', 'team-comparison'])
  })

  it('reports filter by team only', () => {
    for (const report of reports) {
      expect(report.filters).toEqual(['team'])
    }
  })
})
