'use strict';

const { requireRoles, verifyInternal } = require('@solar/service-kit');
const health = require('./controller/health');
const ledger = require('./controller/ledger');
const payments = require('./controller/payments');
const commissions = require('./controller/commissions');
const commissionRules = require('./controller/commissionRules');
const managerCommissionRules = require('./controller/managerCommissionRules');
const managerLedger = require('./controller/managerLedger');
const settlements = require('./controller/settlements');
const internal = require('./controller/internal');
const exportController = require('./controller/export');

module.exports = (app) => {
  const { router } = app;
  const auth = app.auth;
  const staff = requireRoles('super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
    'structural_engineer', 'warehouse', 'accountant', 'after_sales');
  const finance = requireRoles('super_admin', 'accountant');
  const superAdmin = requireRoles('super_admin');
  const internalGuard = verifyInternal({ services: ['identity', 'sales', 'delivery', 'hrms'] });

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

  // 提成规则关键参数：按月份版本维护，仅超级管理员可读写
  router.get('/pv/api/workbench/commission-rules', auth, superAdmin, commissionRules.list);
  router.get('/pv/api/workbench/commission-rules/resolve', auth, superAdmin, commissionRules.resolve);
  router.put('/pv/api/workbench/commission-rules/:period', auth, superAdmin, commissionRules.save);

  // 销售经理提成规则：按月份版本维护，仅超级管理员可读写
  router.get('/pv/api/workbench/manager-commission-rules', auth, superAdmin, managerCommissionRules.list);
  router.get('/pv/api/workbench/manager-commission-rules/resolve', auth, superAdmin, managerCommissionRules.resolve);
  router.put('/pv/api/workbench/manager-commission-rules/:period', auth, superAdmin, managerCommissionRules.save);

  // 销售经理台账：超级管理员全量，销售经理仅本人
  const managerLedgerViewer = requireRoles('super_admin', 'sales_manager');
  router.get('/pv/api/workbench/manager-ledger', auth, managerLedgerViewer, managerLedger.list);
  router.post('/pv/api/workbench/manager-ledger/generate', auth, superAdmin, managerLedger.generate);

  router.get('/pv/api/workbench/settlements', auth, staff, settlements.list);
  router.post('/pv/api/workbench/settlements', auth, finance, settlements.generate);
  router.get('/pv/api/workbench/settlements/:id', auth, staff, settlements.detail);
  router.post('/pv/api/workbench/settlements/:id/confirm', auth, finance, settlements.confirm);
  router.post('/pv/api/workbench/settlements/:id/pay', auth, finance, settlements.pay);

  router.post('/internal/events', internalGuard, internal.events);
};
