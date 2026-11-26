'use strict';

const { auth, roles } = require('../common/auth');
const financeService = require('./service');
const projectService = require('../project/service');
const notificationService = require('../notification/service');

const managers = roles('store_manager');

async function listReceivables(ctx) { ctx.body = await financeService.listReceivables(ctx.app.db, ctx.query, ctx.state.user); }
async function listReceipts(ctx) { ctx.body = await financeService.listReceipts(ctx.app.db, ctx.query, ctx.state.user); }

async function createReceipt(ctx) {
  const result = await financeService.receive(ctx.app.db, ctx.request.body || {}, ctx.state.user);
  const [rows] = await ctx.app.db.query('SELECT * FROM receivables WHERE id = ? LIMIT 1', [ctx.request.body.receivable_id]);
  if (rows.length && rows[0].project_id) {
    const project = await projectService.getProjectRaw(ctx.app.db, rows[0].project_id);
    await notificationService.dispatch(ctx.app, {
      roles: ['store_manager'], storeId: project.store_id,
      title: `收款已核销：${result.receipt_no}`,
      content: `项目 ${project.project_no} 收款 ${ctx.request.body.amount}，应收状态 ${result.receivable_status}${result.settled ? '，项目已结清并自动登记质保' : ''}。`,
      type: 'finance', bizType: 'receipt', bizId: result.receipt_id,
    });
  }
  ctx.body = result;
  ctx.status = 201;
}

async function projectFinance(ctx) {
  await projectService.getProject(ctx.app.db, ctx.params.id, ctx.state.user);
  ctx.body = await financeService.getProjectFinance(ctx.app.db, ctx.params.id);
}

async function summary(ctx) {
  const [outstanding, today] = await Promise.all([
    financeService.outstandingSummary(ctx.app.db, ctx.state.user),
    financeService.todayReceiptsSummary(ctx.app.db, ctx.state.user),
  ]);
  ctx.body = { outstanding_total: outstanding.total, overdue_count: outstanding.overdue.length, receipts_today: today };
}

function mount(router) {
  router.get('/erp/api/finance/receivables', auth, managers, listReceivables);
  router.get('/erp/api/finance/receipts', auth, managers, listReceipts);
  router.post('/erp/api/finance/receipts', auth, managers, createReceipt);
  router.get('/erp/api/finance/projects/:id', auth, projectFinance);
  router.get('/erp/api/finance/summary', auth, managers, summary);
}

module.exports = { mount };
