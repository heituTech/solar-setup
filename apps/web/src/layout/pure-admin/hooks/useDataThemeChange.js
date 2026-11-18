import { useEpThemeStoreHook } from '@/stores/epTheme';
import { getConfig } from '@/config';
import { useGlobal } from '@pureadmin/utils';

export function useDataThemeChange() {
  const { $storage } = useGlobal();
  const epThemeStore = useEpThemeStoreHook();

  function setEpThemeColor(color) {
    epThemeStore.setEpThemeColor(color);
  }

  function dataThemeChange(overall) {
    const layout = $storage.layout || {};
    if (layout.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const color = layout.epThemeColor || getConfig().EpThemeColor || '#1f7a4d';
    setEpThemeColor(color);
  }

  return { dataThemeChange, setEpThemeColor };
}
