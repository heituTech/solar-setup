import { defineStore } from 'pinia';
import { store } from '@/stores';
import { getConfig, responsiveStorageNameSpace } from '@/config';
import { storageLocal, deviceDetection } from '@pureadmin/utils';

export const useAppStore = defineStore('pure-app', {
  state: () => ({
    sidebar: {
      opened: storageLocal().getItem(`${responsiveStorageNameSpace()}layout`)?.sidebarStatus ?? getConfig().SidebarStatus ?? true,
      withoutAnimation: false,
      isClickCollapse: false,
    },
    layout: storageLocal().getItem(`${responsiveStorageNameSpace()}layout`)?.layout ?? getConfig().Layout ?? 'vertical',
    device: deviceDetection() ? 'mobile' : 'desktop',
    viewportSize: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
  }),
  getters: {
    getSidebarStatus: (state) => state.sidebar.opened,
    getDevice: (state) => state.device,
    getViewportWidth: (state) => state.viewportSize.width,
    getViewportHeight: (state) => state.viewportSize.height,
  },
  actions: {
    TOGGLE_SIDEBAR(opened, resize) {
      const layout = storageLocal().getItem(`${responsiveStorageNameSpace()}layout`) || {};
      if (opened && resize) {
        this.sidebar.withoutAnimation = true;
        this.sidebar.opened = true;
        layout.sidebarStatus = true;
      } else if (!opened && resize) {
        this.sidebar.withoutAnimation = true;
        this.sidebar.opened = false;
        layout.sidebarStatus = false;
      } else if (!opened && !resize) {
        this.sidebar.withoutAnimation = false;
        this.sidebar.opened = !this.sidebar.opened;
        this.sidebar.isClickCollapse = !this.sidebar.opened;
        layout.sidebarStatus = this.sidebar.opened;
      }
      storageLocal().setItem(`${responsiveStorageNameSpace()}layout`, layout);
    },
    async toggleSideBar(opened, resize) {
      await this.TOGGLE_SIDEBAR(opened, resize);
    },
    toggleDevice(device) {
      this.device = device;
    },
    setLayout(layout) {
      this.layout = layout;
    },
    setViewportSize(size) {
      this.viewportSize = size;
    },
  },
});

export function useAppStoreHook() {
  return useAppStore(store);
}
