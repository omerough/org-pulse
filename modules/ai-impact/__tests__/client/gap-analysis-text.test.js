import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GapAnalysisText from '../../client/components/GapAnalysisText.vue'

describe('GapAnalysisText', () => {
  it('renders collapsible sections with count badges', () => {
    const gapText = `## Scope & Endpoints

- **API specification** — Missing endpoint details. Would be resolved by: API spec.
- **Schema definition** — No schema provided. Would be resolved by: Design doc.

## Test Strategy & Risks

- **Performance targets** — No SLOs defined. Would be resolved by: NFR specification.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    // Section headers should be styled uppercase
    const headers = wrapper.findAll('h5')
    expect(headers).toHaveLength(2)
    expect(headers[0].text()).toBe('Scope & Endpoints')
    expect(headers[1].text()).toBe('Test Strategy & Risks')
    expect(headers[0].classes()).toContain('uppercase')

    // Count badges should show correct numbers
    const badges = wrapper.findAll('span.px-1\\.5')
    expect(badges).toHaveLength(2)
    expect(badges[0].text()).toBe('2')
    expect(badges[1].text()).toBe('1')

    // Sections should be collapsed by default
    expect(wrapper.findAll('span.mr-2')).toHaveLength(0)

    // Click to expand first section
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
  })

  it('expands section on click', async () => {
    const gapText = `## Scope & Endpoints

- **API specification** — Missing endpoint details. Would be resolved by: API spec.
- **Schema definition** — No schema provided. Would be resolved by: Design doc.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    // Should be collapsed initially
    expect(wrapper.findAll('span.mr-2')).toHaveLength(0)

    // Click section header to expand
    const button = wrapper.find('button')
    await button.trigger('click')

    // Should now show bullets
    expect(wrapper.findAll('span.mr-2')).toHaveLength(2)

    // Bold text should be strong tags
    const strongTags = wrapper.findAll('strong')
    expect(strongTags.length).toBe(2)
    expect(strongTags[0].text()).toBe('API specification')
  })

  it('handles empty text', () => {
    const wrapper = mount(GapAnalysisText, {
      props: { text: '' }
    })
    expect(wrapper.findAll('h5')).toHaveLength(0)
  })

  it('parses inline bold correctly when expanded', async () => {
    const gapText = `## Environment

- **GPU types** — Test requires A100 or V100 but **none specified**. Would be resolved by: ADR.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    // Expand section
    await wrapper.find('button').trigger('click')

    const strongTags = wrapper.findAll('strong')
    expect(strongTags.length).toBe(2)
    expect(strongTags[0].text()).toBe('GPU types')
    expect(strongTags[1].text()).toBe('none specified')
  })

  it('joins multi-line bullet items before parsing', async () => {
    const gapText = `## Environment & Infrastructure

- **Node resource requirements (CPU, memory, GPU) for OGX
  distribution pods not specified** — would be resolved by: ADR or
  design doc with resource limit/request specifications
- **Single line item** — stays the same`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    // Count badge should show 2 items
    const badge = wrapper.find('span.px-1\\.5')
    expect(badge.text()).toBe('2')

    // Expand section
    await wrapper.find('button').trigger('click')

    const strongTags = wrapper.findAll('strong')
    expect(strongTags[0].text()).toBe('Node resource requirements (CPU, memory, GPU) for OGX distribution pods not specified')
    expect(strongTags[1].text()).toBe('Single line item')

    // Resolution text should be present (not truncated)
    const text = wrapper.text()
    expect(text).toContain('would be resolved by: ADR or design doc with resource limit/request specifications')
  })

  it('parses ### headers from test plan scoring findings', () => {
    const gapText = `### Critical (2)
1. Grounding is zero: no references to test framework or fixtures.
2. FR-11 is claimed as in-scope but has no test cases.

### Important (2)
1. TC-FR7-06 is misplaced under the FR-13 section heading.
2. No test case references existing tests as implementation patterns.

### Suggestions (3)
1. Add a test infrastructure section at the top.
2. Consolidate all FR-7 test cases under a single heading.
3. Reference the InstanceType lifecycle test pattern.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    const headers = wrapper.findAll('h5')
    expect(headers).toHaveLength(3)
    expect(headers[0].text()).toBe('Critical (2)')
    expect(headers[1].text()).toBe('Important (2)')
    expect(headers[2].text()).toBe('Suggestions (3)')

    const badges = wrapper.findAll('span.px-1\\.5')
    expect(badges[0].text()).toBe('2')
    expect(badges[1].text()).toBe('2')
    expect(badges[2].text()).toBe('3')
  })

  it('parses numbered items and strips numeric prefix', async () => {
    const gapText = `### Critical (1)
1. Grounding is zero: no references to test framework.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    await wrapper.find('button').trigger('click')

    const bullets = wrapper.findAll('span.mr-2')
    expect(bullets).toHaveLength(1)
    expect(wrapper.text()).toContain('Grounding is zero')
    expect(wrapper.text()).not.toMatch(/^1\./)
  })

  it('classifies Critical as new/alert and Suggestions as resolved', () => {
    const gapText = `### Critical (1)
1. Something critical.

### Suggestions (1)
1. Something nice to have.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    const headers = wrapper.findAll('h5')
    expect(headers[0].classes()).toContain('text-amber-700')
    expect(headers[1].classes()).toContain('text-green-700')
  })

  it('toggles chevron rotation on expand/collapse', async () => {
    const gapText = `## Scope & Endpoints

- **API specification** — Missing endpoint details.`

    const wrapper = mount(GapAnalysisText, {
      props: { text: gapText }
    })

    const chevron = wrapper.find('svg')

    // Should not be rotated initially (collapsed)
    expect(chevron.classes()).not.toContain('rotate-90')

    // Click to expand
    await wrapper.find('button').trigger('click')
    expect(chevron.classes()).toContain('rotate-90')

    // Click to collapse
    await wrapper.find('button').trigger('click')
    expect(chevron.classes()).not.toContain('rotate-90')
  })
})
