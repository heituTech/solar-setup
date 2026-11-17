'use strict';

const { requireRoles, verifyInternal } = require('@solar/service-kit');
const health = require('./controller/health');
const auth = require('./controller/auth');
const users = require('./controller/users');
const approvals = require('./controller/approvals');
const internal = require('./controller/internal');

module.exports = (app) => {
  const { router } = app;
  const authMiddleware = app.auth;
  const internalGuard = verifyInternal({ services: ['sales', 'delivery', 'finance'] });
  const staff = requireRoles('super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
    'structural_engineer', 'warehouse', 'accountant', 'after_sales');
  const admin = requireRoles('super_admin');

  router.get('/health', health.health);
  router.get('/pv/api/health', health.health);

  router.post('/pv/api/auth/register', auth.register);
  router.post('/pv/api/auth/login', auth.login);
  router.get('/pv/api/auth/me', authMiddleware, auth.me);
  router.post('/pv/api/auth/logout', authMiddleware, auth.logout);

  router.get('/pv/api/admin/health', authMiddleware, requireRoles('super_admin', 'accountant'), health.overview);
  router.get('/pv/api/workbench/directory', authMiddleware, staff, users.directory);
  router.get('/pv/api/admin/users', authMiddleware, requireRoles('super_admin', 'sales_manager'), users.list);
  router.post('/pv/api/admin/users', authMiddleware, admin, users.create);
  router.patch('/pv/api/admin/users/:id', authMiddleware, admin, users.update);

  router.get('/pv/api/approvals', authMiddleware, staff, approvals.list);
  router.post('/pv/api/approvals', authMiddleware, requireRoles('salesperson', 'sales_manager'), approvals.create);
  router.post('/pv/api/approvals/:id/decide', authMiddleware, requireRoles('super_admin', 'sales_manager'), approvals.decide);
  router.get('/pv/api/admin/flows', authMiddleware, admin, approvals.flows);

  router.post('/internal/auth/introspect', internalGuard, internal.introspect);
  router.post('/internal/events', internalGuard, internal.events);
};
