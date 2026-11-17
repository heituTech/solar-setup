'use strict';

const { requireRoles, verifyInternal } = require('@solar/service-kit');
const health = require('./controller/health');
const ledger = require('./controller/ledger');
const payments = require('./controller/payments');
const commissions = require('./controller/commissions');
const settlements = require('./controller/settlements');
const internal = require('./controller/internal');
const exportController = require('./controller/export');

module.exports = (app) => {
  const { router } = app;
  const auth = app.auth;
  const staff = requireRoles('super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
    'structural_engineer', 'warehouse', 'accountant', 'after_sales');
  const finance = requireRoles('super_admin', 'accountant');
  const internalGuard = verifyInternal({ services: ['identity', 'sales', 'delivery'] });

  router.get('/health', health.health);
  router.get('/pv/api/health', health.health);

  router.get('/pv/api/workbench/ledger', auth, staff, ledger.list);
  router.get('/pv/api/workbench/ledger/export', auth, finance, exportController.exportLedger);
  router.get('/pv/api/workbench/finance/summary', auth, staff, ledger.summary);

  router.get('/pv/api/workbench/payments', auth, staff, payments.list);
  router.post('/pv/api/workbench/payments', auth, finance, payments.create);

  router.get('/pv/api/workbench/compensation-config', auth, staff, commissions.getConfig);
  router.put('/pv/api/workbench/compensation-config', auth, finance, commissions.updateConfig);
  router.get('/pv/api/workbench/adjustments', auth, staff, commissions.listAdjustments);
  router.post('/pv/api/workbench/adjustments', auth, finance, commissions.createAdjustment);

  router.get('/pv/api/workbench/settlements', auth, staff, settlements.list);
  router.post('/pv/api/workbench/settlements', auth, finance, settlements.generate);
  router.get('/pv/api/workbench/settlements/:id', auth, staff, settlements.detail);
  router.post('/pv/api/workbench/settlements/:id/confirm', auth, finance, settlements.confirm);
  router.post('/pv/api/workbench/settlements/:id/pay', auth, finance, settlements.pay);

  router.post('/internal/events', internalGuard, internal.events);
};
