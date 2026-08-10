import { describe, it, expect } from 'vitest'
import { reports } from '../../client/reports/registry.js'

describe('reports registry', () => {
  it('keeps the program-hygiene report id stable (FeatureDetailView depends on it for back-navigation)', () => {
    const entry = reports.find(r => r.id === 'program-hygiene')
    expect(entry).toBeTruthy()
  })

  it('renames the program-hygiene report to "Jira Hygiene"', () => {
    const entry = reports.find(r => r.id === 'program-hygiene')
    expect(entry.label).toBe('Jira Hygiene')
  })

  it('places the program-hygiene report first in the reports array', () => {
    expect(reports[0].id).toBe('program-hygiene')
  })

  it('hides the Release Performance report (CP2 — legacy non-OSAC nav surface)', () => {
    expect(reports.find(r => r.id === 'release-performance')).toBeUndefined()
  })

  it('hides the TV/FV Delta report (CP2 — legacy non-OSAC nav surface)', () => {
    expect(reports.find(r => r.id === 'tv-fv-delta')).toBeUndefined()
  })

  it('keeps Feature Pressure but drops inherited RHAI wording from its description', () => {
    const entry = reports.find(r => r.id === 'feature-pressure')
    expect(entry).toBeTruthy()
    expect(entry.description).not.toMatch(/RHAI/)
  })
})
