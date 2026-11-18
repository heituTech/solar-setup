'use strict';

const { sendReports } = require('../../lib/reports');

function localNow(offsetHours) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000);
}

// 每小时检查一次：按配置时区到达指定小时且当天为月末时，生成并发送个人业绩报告
module.exports = {
  schedule: { cron: '0 0 * * * *', type: 'worker' },
  async task(ctx) {
    const config = ctx.app.config.hrms;
    if (!config.reportEnabled) return;
    const now = localNow(Number(config.timezoneOffsetHours || 8));
    if (now.getUTCHours() !== Number(config.reportHour || 20)) return;
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (tomorrow.getUTCDate() !== 1) return;
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    try {
      const summary = await sendReports(ctx.app, { period, type: 'personal' });
      ctx.app.logger.info('[hrms] personal report summary=%j', summary);
    } catch (error) {
      ctx.app.logger.error('[hrms] personal report failed: %s', error.stack || error.message);
    }
  },
};
