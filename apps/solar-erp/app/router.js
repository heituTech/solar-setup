'use strict';

// 路由汇总：每个业务域自行提供 mount(router)，
// 域与域之间只通过 service 协作，便于将来按域拆分服务。
module.exports = (app) => {
  const { router } = app;
  require('../src/common/routes').mount(router);
  require('../src/auth/routes').mount(router);
  require('../src/master/routes').mount(router);
  require('../src/project/routes').mount(router);
  require('../src/sales/routes').mount(router);
  require('../src/inventory/routes').mount(router);
  require('../src/finance/routes').mount(router);
  require('../src/notification/routes').mount(router);
  require('../src/agent/routes').mount(router);
};
