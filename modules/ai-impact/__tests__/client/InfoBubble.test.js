import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InfoBubble from '../../client/components/InfoBubble.vue';

// InfoBubble teleports its tooltip to <body>, outside the component root, so
// assertions read document.body rather than wrapper.text().
function isTooltipVisible(text) {
  return document.body.textContent.includes(text);
}

describe('InfoBubble default (click) trigger', () => {
  it('is closed until clicked, and toggles closed on a second click', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello' }, attachTo: document.body });
    expect(isTooltipVisible('hello')).toBe(false);

    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });

  it('does not reveal on hover or focus (unrelated badge/list-row consumers keep click-only behavior)', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello' }, attachTo: document.body });
    await wrapper.find('button').trigger('mouseenter');
    expect(isTooltipVisible('hello')).toBe(false);
    await wrapper.find('button').trigger('focus');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });
});

describe('InfoBubble trigger="hover"', () => {
  it('reveals on pointer hover and hides on mouseleave', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });
    await wrapper.find('button').trigger('mouseenter');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('mouseleave');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });

  it('reveals on keyboard focus and hides on blur, for non-pointer accessibility', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });
    await wrapper.find('button').trigger('focus');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('blur');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });

  it('still supports click/tap as the touch fallback', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });
    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(true);
    wrapper.unmount();
  });
});

describe('InfoBubble trigger="hover" on a non-hover-capable (touch) pointer', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockHoverCapable(matches) {
    window.matchMedia = vi.fn().mockReturnValue({ matches });
  }

  it('ignores a synthetic mouseenter, so a tap does not open-then-instantly-close via toggle', async () => {
    mockHoverCapable(false);
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });

    // Some touch browsers fire mouseenter immediately before click on tap.
    await wrapper.find('button').trigger('mouseenter');
    expect(isTooltipVisible('hello')).toBe(false);

    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(true);
    wrapper.unmount();
  });

  it('does not close on a synthetic mouseleave after the tap-opened tooltip', async () => {
    mockHoverCapable(false);
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });

    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('mouseleave');
    expect(isTooltipVisible('hello')).toBe(true);
    wrapper.unmount();
  });

  it('still opens on keyboard focus (accessibility unaffected by pointer capability)', async () => {
    mockHoverCapable(false);
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });

    await wrapper.find('button').trigger('focus');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('blur');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });
});

describe('InfoBubble trigger="hover" on a hover-capable (mouse) pointer', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('still opens/closes on real mouse hover', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const wrapper = mount(InfoBubble, { props: { text: 'hello', trigger: 'hover' }, attachTo: document.body });

    await wrapper.find('button').trigger('mouseenter');
    expect(isTooltipVisible('hello')).toBe(true);

    await wrapper.find('button').trigger('mouseleave');
    expect(isTooltipVisible('hello')).toBe(false);
    wrapper.unmount();
  });
});

describe('InfoBubble default (click) trigger is unaffected by the hover-pointer gating', () => {
  it('still only opens on click, ignoring hover/focus entirely', async () => {
    const wrapper = mount(InfoBubble, { props: { text: 'hello' }, attachTo: document.body });
    await wrapper.find('button').trigger('mouseenter');
    expect(isTooltipVisible('hello')).toBe(false);

    await wrapper.find('button').trigger('click');
    expect(isTooltipVisible('hello')).toBe(true);
    wrapper.unmount();
  });
});
