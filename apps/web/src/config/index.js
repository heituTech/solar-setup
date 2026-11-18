let config = {};

const setConfig = (cfg) => {
  config = Object.assign(config, cfg);
};

const getConfig = (key) => {
  if (typeof key === 'string') {
    const arr = key.split('.');
    if (arr && arr.length) {
      let data = config;
      arr.forEach((v) => {
        if (data && typeof data[v] !== 'undefined') data = data[v];
        else data = null;
      });
      return data;
    }
  }
  return config;
};

export const getPlatformConfig = async (app) => {
  app.config.globalProperties.$config = getConfig();
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}platform-config.json`;
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`http_${res.status}`);
      return res.json();
    })
    .then((cfg) => {
      let $config = app.config.globalProperties.$config;
      if (app && $config && typeof cfg === 'object') {
        $config = Object.assign($config, cfg);
        app.config.globalProperties.$config = $config;
        setConfig($config);
      }
      return $config;
    })
    .catch(() => {
      throw '请在 public 文件夹下添加 platform-config.json 配置文件';
    });
};

const responsiveStorageNameSpace = () => getConfig().ResponsiveStorageNameSpace || 'pure-admin-';

export { getConfig, setConfig, responsiveStorageNameSpace };
