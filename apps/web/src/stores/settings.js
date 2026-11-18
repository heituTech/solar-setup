import { defineStore } from 'pinia';
import { store } from '@/stores';
import { getConfig } from '@/config';

export const useSettingStore = defineStore('pure-setting', {
  state: () => ({
    title: getConfig().Title || 'HEITU ERP v2.0',
    fixedHeader: getConfig().FixedHeader ?? true,
    hiddenSideBar: getConfig().HiddenSideBar ?? false,
  }),
  getters: {
    getTitle: (state) => state.title,
    getFixedHeader: (state) => state.fixedHeader,
    getHiddenSideBar: (state) => state.hiddenSideBar,
  },
  actions: {
    CHANGE_SETTING({ key, value }) {
      if (Reflect.has(this, key)) this[key] = value;
    },
    changeSetting(data) {
      this.CHANGE_SETTING(data);
    },
  },
});

export function useSettingStoreHook() {
  return useSettingStore(store);
}
