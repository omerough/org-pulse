import { describe, it, expect } from 'vitest';
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
