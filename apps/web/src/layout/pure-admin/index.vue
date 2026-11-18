<script setup>
import { ref, reactive, computed, onMounted, onBeforeMount } from 'vue';
import { useAppStoreHook } from '@/stores/app';
import { useSettingStoreHook } from '@/stores/settings';
import { useDataThemeChange } from './hooks/useDataThemeChange';
import { useDark, useGlobal, deviceDetection, useResizeObserver } from '@pureadmin/utils';
import Sidebar from './Sidebar.vue';
import Navbar from './Navbar.vue';
import Content from './Content.vue';

const appWrapperRef = ref();
const { isDark } = useDark();
const isMobile = deviceDetection();
const appStore = useAppStoreHook();
const pureSetting = useSettingStoreHook();
const { $storage } = useGlobal();

const layout = computed(() => appStore.layout || 'vertical');

const set = reactive({
  sidebar: computed(() => appStore.sidebar),
  device: computed(() => appStore.device),
  fixedHeader: computed(() => pureSetting.fixedHeader),
  classes: computed(() => ({
    hideSidebar: !set.sidebar.opened,
    openSidebar: set.sidebar.opened,
    withoutAnimation: set.sidebar.withoutAnimation,
    mobile: set.device === 'mobile',
  })),
});

function setTheme(layoutModel) {
  window.document.body.setAttribute('layout', layoutModel);
  const old = $storage.layout || {};
  $storage.layout = {
    layout: layoutModel,
    theme: old.theme,
    darkMode: old.darkMode,
    sidebarStatus: old.sidebarStatus,
    epThemeColor: old.epThemeColor,
    themeColor: old.themeColor,
    overallStyle: old.overallStyle,
  };
}

function toggle(device, bool) {
  appStore.toggleDevice(device);
  appStore.toggleSideBar(bool, 'resize');
}

let isAutoCloseSidebar = true;
useResizeObserver(appWrapperRef, (entries) => {
  if (isMobile) return;
  const entry = entries[0];
  const [{ inlineSize: width }] = entry.borderBoxSize;
  appStore.setViewportSize({ width, height: entry.borderBoxSize[0].blockSize });
  width <= 760 ? setTheme('vertical') : setTheme(appStore.layout);
  if (width > 0 && width <= 760) {
    toggle('mobile', false);
    isAutoCloseSidebar = true;
  } else if (width > 760 && width <= 990) {
    if (isAutoCloseSidebar) {
      toggle('desktop', false);
      isAutoCloseSidebar = false;
    }
  } else if (width > 990 && !set.sidebar.isClickCollapse) {
    toggle('desktop', true);
    isAutoCloseSidebar = true;
  } else {
    toggle('desktop', false);
    isAutoCloseSidebar = false;
  }
});

onMounted(() => {
  if (isMobile) toggle('mobile', false);
});

onBeforeMount(() => {
  useDataThemeChange().dataThemeChange($storage.layout?.overallStyle);
});
</script>

<template>
  <div ref="appWrapperRef" :class="['app-wrapper', set.classes]">
    <div
      v-show="set.device === 'mobile' && set.sidebar.opened && layout.includes('vertical')"
      class="app-mask"
      @click="appStore.toggleSideBar()"
    />
    <Sidebar v-show="!pureSetting.hiddenSideBar" />
    <div :class="['main-container', pureSetting.hiddenSideBar ? 'main-hidden' : '']">
      <div v-if="set.fixedHeader">
        <Navbar />
        <Content :fixed-header="set.fixedHeader" />
      </div>
      <el-scrollbar v-else>
        <Navbar />
        <Content :fixed-header="set.fixedHeader" />
      </el-scrollbar>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.app-wrapper {
  position: relative;
  width: 100%;
  height: 100%;

  &.mobile.openSidebar {
    position: fixed;
    top: 0;
  }
}

.app-mask {
  position: absolute;
  top: 0;
  z-index: 2001;
  width: 100%;
  height: 100%;
  background: #000;
  opacity: 0.3;
}
</style>
