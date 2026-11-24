'use strict';

const { requireRoles, verifyInternal } = require('@solar/service-kit');
const health = require('./controller/health');
const projects = require('./controller/projects');
const devices = require('./controller/devices');
const tickets = require('./controller/tickets');
const internal = require('./controller/internal');

module.exports = (app) => {
  const { router } = app;
  const auth = app.auth;
  const staff = requireRoles('super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
    'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'after_sales_manager');
  const managers = requireRoles('super_admin', 'sales_manager', 'after_sales');
  const engineers = requireRoles('super_admin', 'electrical_engineer', 'structural_engineer');
  const field = requireRoles('super_admin', 'electrical_engineer', 'structural_engineer', 'warehouse', 'after_sales');
  const afterSales = requireRoles('super_admin', 'after_sales', 'after_sales_manager', 'electrical_engineer', 'structural_engineer');
  const ticketManagers = requireRoles('super_admin', 'after_sales_manager');
  const internalGuard = verifyInternal({ services: ['identity', 'sales', 'finance'] });

  router.get('/health', health.health);
  router.get('/pv/api/health', health.health);

  router.get('/pv/api/workbench/projects', auth, staff, projects.list);
  router.get('/pv/api/workbench/projects/by-order/:orderId', auth, staff, projects.byOrder);
  router.get('/pv/api/workbench/projects/:id', auth, staff, projects.detail);
  router.post('/pv/api/workbench/projects/:id/assign', auth, managers, projects.assign);
  router.post('/pv/api/workbench/projects/:id/progress', auth, field, projects.progress);
  router.post('/pv/api/workbench/projects/:id/accept', auth, engineers, projects.accept);

  router.get('/pv/api/workbench/devices', auth, staff, devices.list);
  router.post('/pv/api/workbench/devices', auth, field, devices.create);
  router.patch('/pv/api/workbench/devices/:id', auth, field, devices.update);

  router.get('/pv/api/workbench/tickets', auth, staff, tickets.list);
  router.get('/pv/api/workbench/tickets/:id', auth, staff, tickets.detail);
  router.post('/pv/api/workbench/tickets', auth, staff, tickets.create);
  router.patch('/pv/api/workbench/tickets/:id', auth, afterSales, tickets.update);
  router.patch('/pv/api/workbench/tickets/:id/stakeholders', auth, ticketManagers, tickets.updateStakeholders);
  router.delete('/pv/api/workbench/tickets/:id', auth, ticketManagers, tickets.remove);

  router.post('/internal/events', internalGuard, internal.events);
};
