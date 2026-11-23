'use strict';

const { requireRoles, verifyInternal } = require('@solar/service-kit');
const health = require('./controller/health');
const customers = require('./controller/customers');
const surveys = require('./controller/surveys');
const quotes = require('./controller/quotes');
const orders = require('./controller/orders');
const scenarios = require('./controller/scenarios');
const systemConfigs = require('./controller/systemConfigs');
const workbench = require('./controller/workbench');
const catalog = require('./controller/catalog');
const cases = require('./controller/cases');
const misc = require('./controller/misc');
const internal = require('./controller/internal');

module.exports = (app) => {
  const { router } = app;
  const auth = app.auth;
  const staff = requireRoles('super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
    'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'after_sales_manager');
  const sales = requireRoles('super_admin', 'sales_manager', 'salesperson');
  const managers = requireRoles('super_admin', 'sales_manager');
  const engineers = requireRoles('super_admin', 'electrical_engineer', 'structural_engineer');
  const internalGuard = verifyInternal({ services: ['identity', 'delivery', 'finance'] });

  router.get('/health', health.health);
  router.get('/pv/api/health', health.health);

  router.get('/pv/api/config', misc.config);
  router.get('/pv/api/geo', misc.geo);
  router.get('/pv/skill', misc.skill);

  router.get('/pv/api/workbench/summary', auth, sales, workbench.summary);

  router.get('/pv/api/workbench/customers', auth, sales, customers.list);
  router.get('/pv/api/workbench/customers/:id', auth, sales, customers.detail);
  router.post('/pv/api/workbench/customers', auth, sales, customers.create);
  router.patch('/pv/api/workbench/customers/:id', auth, sales, customers.update);

  // 用电场景
  router.get('/pv/api/workbench/customers/:customerId/scenarios', auth, sales, scenarios.list);
  router.post('/pv/api/workbench/customers/:customerId/scenarios', auth, sales, scenarios.create);
  router.get('/pv/api/workbench/scenarios/:id', auth, sales, scenarios.detail);
  router.patch('/pv/api/workbench/scenarios/:id', auth, sales, scenarios.update);
  router.delete('/pv/api/workbench/scenarios/:id', auth, sales, scenarios.remove);

  // 系统配置（预算参考）
  router.get('/pv/api/workbench/scenarios/:scenarioId/configs', auth, sales, systemConfigs.list);
  router.get('/pv/api/workbench/scenarios/:scenarioId/formula-preview', auth, sales, systemConfigs.formulaPreview);
  router.post('/pv/api/workbench/scenarios/:scenarioId/configs', auth, sales, systemConfigs.create);
  router.get('/pv/api/workbench/configs/:id', auth, sales, systemConfigs.detail);
  router.patch('/pv/api/workbench/configs/:id', auth, sales, systemConfigs.update);
  router.delete('/pv/api/workbench/configs/:id', auth, sales, systemConfigs.remove);

  router.get('/pv/api/workbench/surveys', auth, staff, surveys.list);
  router.post('/pv/api/workbench/surveys', auth, sales, surveys.create);
  router.post('/pv/api/workbench/surveys/:id/submit', auth, sales, surveys.submit);
  router.post('/pv/api/workbench/surveys/:id/review', auth, engineers, surveys.review);
  router.post('/pv/api/workbench/surveys/:id/construction-cost', auth, engineers, surveys.fillConstructionCost);
  router.post('/pv/api/workbench/surveys/:id/link-order', auth, sales, surveys.linkOrder);

  router.get('/pv/api/workbench/quotes', auth, sales, quotes.list);
  router.post('/pv/api/workbench/quotes', auth, sales, quotes.create);
  router.patch('/pv/api/workbench/quotes/:id', auth, sales, quotes.update);
  router.post('/pv/api/workbench/quotes/:id/submit', auth, sales, quotes.submit);
  router.post('/pv/api/workbench/quotes/:id/approve', auth, managers, quotes.approve);
  router.post('/pv/api/workbench/quotes/:id/accept', auth, sales, quotes.accept);
  router.post('/pv/api/workbench/quotes/:id/convert', auth, sales, quotes.convert);

  router.get('/pv/api/workbench/orders', auth, staff, orders.list);
  router.get('/pv/api/workbench/orders/:id', auth, staff, orders.detail);
  router.patch('/pv/api/workbench/orders/:id', auth, managers, orders.updateCommission);
  router.post('/pv/api/workbench/orders/from-config', auth, sales, orders.createFromConfig);
  router.patch('/pv/api/workbench/orders/:id/items/:itemId', auth, sales, orders.updateItem);
  router.delete('/pv/api/workbench/orders/:id/items/:itemId', auth, sales, orders.removeItem);

  router.get('/pv/api/products', auth, sales, catalog.list);
  router.post('/pv/api/products', auth, sales, catalog.create);
  router.patch('/pv/api/products/:id', auth, sales, catalog.update);

  router.get('/pv/api/cases', auth, cases.list);
  router.post('/pv/api/cases', auth, cases.create);
  router.delete('/pv/api/cases/:id', auth, cases.remove);
  router.get('/pv/api/cases/shared/:token', cases.shared);

  router.post('/internal/events', internalGuard, internal.events);
};
