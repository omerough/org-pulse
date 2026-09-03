import { describe, it, expect } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useDarkMode } from '../../client/composables/useDarkMode.js';

function mountProbe() {
  let state;
  const Probe = defineComponent({
    setup() {
      state = useDarkMode();
      return () => h('div');
    }
  });
  const wrapper = mount(Probe);
  return { wrapper, state };
}

describe('useDarkMode', () => {
  it('starts light and reacts when the `dark` class is added to <html>', async () => {
    document.documentElement.classList.remove('dark');
    const { state } = mountProbe();

    expect(state.isDark.value).toBe(false);
    expect(state.textColor.value).toBe('rgba(107, 114, 128, 1)');
    expect(state.gridColor.value).toBe('rgba(229, 231, 235, 1)');

    document.documentElement.classList.add('dark');
    // MutationObserver callbacks flush as a microtask.
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(state.isDark.value).toBe(true);
    expect(state.textColor.value).toBe('rgba(209, 213, 219, 1)');
    expect(state.gridColor.value).toBe('rgba(75, 85, 99, 0.5)');

    document.documentElement.classList.remove('dark');
  });

  it('detects dark mode already set on mount', () => {
    document.documentElement.classList.add('dark');
    const { state } = mountProbe();
    expect(state.isDark.value).toBe(true);
    document.documentElement.classList.remove('dark');
  });
});
