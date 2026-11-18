import { defineStore } from 'pinia';
import { store } from '@/stores';

export const useEpThemeStore = defineStore('pure-epTheme', {
  state: () => ({
    epTheme: 'light',
  }),
  actions: {
    setEpThemeColor(newColor) {
      const body = document.documentElement;
      if (!newColor) return;
      body.style.setProperty('--el-color-primary', newColor);
      const mix = (color1, color2, weight) => {
        const c1 = color1.replace('#', '');
        const c2 = color2.replace('#', '');
        const r1 = parseInt(c1.substring(0, 2), 16);
        const g1 = parseInt(c1.substring(2, 4), 16);
        const b1 = parseInt(c1.substring(4, 6), 16);
        const r2 = parseInt(c2.substring(0, 2), 16);
        const g2 = parseInt(c2.substring(2, 4), 16);
        const b2 = parseInt(c2.substring(4, 6), 16);
        const r = Math.round(r1 + (r2 - r1) * weight);
        const g = Math.round(g1 + (g2 - g1) * weight);
        const b = Math.round(b1 + (b2 - b1) * weight);
        return `rgb(${r}, ${g}, ${b})`;
      };
      for (let i = 1; i <= 9; i++) {
        body.style.setProperty(`--el-color-primary-light-${i}`, mix(newColor, '#ffffff', i * 0.1));
      }
      body.style.setProperty('--el-color-primary-dark-2', mix(newColor, '#000000', 0.2));
    },
  },
});

export function useEpThemeStoreHook() {
  return useEpThemeStore(store);
}
