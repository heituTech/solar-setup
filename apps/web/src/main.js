import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { storageLocal } from '@pureadmin/utils';
import App from './App.vue';
import router from './router';
import { i18n } from './locales';
import { store } from './stores';
import { getPlatformConfig, getConfig } from './config';
import { useEpThemeStoreHook } from './stores/epTheme';
import './styles/main.css';

const app = createApp(App);
app.use(store).use(router).use(i18n).use(ElementPlus);
app.config.globalProperties.$storage = storageLocal();

getPlatformConfig(app).then(() => {
  app.mount('#app');
  useEpThemeStoreHook().setEpThemeColor(getConfig().EpThemeColor);
}).catch((err) => {
  console.error(err);
  app.mount('#app');
});
