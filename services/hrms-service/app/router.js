'use strict';

const { requireRoles } = require('@solar/service-kit');
const health = require('./controller/health');
const performance = require('./controller/performance');
const reports = require('./controller/reports');

module.exports = (app) => {
  const { router } = app;
  const auth = app.auth;
  const superAdmin = requireRoles('super_admin');

  router.get('/health', health.health);
  router.get('/pv/api/health', health.health);

  router.get('/pv/api/hrms/performance', auth, superAdmin, performance.list);
  router.get('/pv/api/hrms/performance/team', auth, superAdmin, performance.team);

  router.get('/pv/api/hrms/report/recipients', auth, superAdmin, reports.listRecipients);
  router.post('/pv/api/hrms/report/recipients', auth, superAdmin, reports.addRecipient);
  router.delete('/pv/api/hrms/report/recipients/:id', auth, superAdmin, reports.removeRecipient);
  router.get('/pv/api/hrms/report/logs', auth, superAdmin, reports.listLogs);
  router.post('/pv/api/hrms/report/send', auth, superAdmin, reports.sendNow);
};
