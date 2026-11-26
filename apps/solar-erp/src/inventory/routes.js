'use strict';

const { auth, roles } = require('../common/auth');
const inventoryService = require('./service');
const projectService = require('../project/service');
const notificationService = require('../notification/service');

const storeTeam = roles('store_manager', 'store_clerk');
const managers = roles('store_manager');
const staff = roles('store_manager', 'store_clerk', 'electrical_engineer', 'structural_engineer', 'construction_captain');

async function listStocks(ctx) { ctx.body = await inventoryService.listStocks(ctx.app.db, ctx.query, ctx.state.user); }
async function adjust(ctx) { ctx.body = await inventoryService.adjustStock(ctx.app.db, ctx.request.body || {}, ctx.state.user); }
async function lowStock(ctx) { ctx.body = { items: await inventoryService.lowStock(ctx.app.db, ctx.state.user) }; }
async function listIssues(ctx) { ctx.body = await inventoryService.listIssues(ctx.app.db, ctx.query, ctx.state.user); }
async function listMovements(ctx) { ctx.body = await inventoryService.listMovements(ctx.app.db, ctx.query, ctx.state.user); }

async function createIssue(ctx) {
  const result = await inventoryService.createIssue(ctx.app.db, ctx.request.body || {}, ctx.state.user);
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.request.body.project_id);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `领料申请待审批：${result.issue_no}`,
    content: `项目 ${project.project_no}（${project.customer_name}）提交领料申请，预计成本 ${result.total_cost}，请审批。`,
    type: 'project', bizType: 'material_issue', bizId: result.id,
  });
  ctx.body = result;
  ctx.status = 201;
}

async function approve(ctx) {
  ctx.body = await inventoryService.approveIssue(ctx.app.db, ctx.params.id, ctx.state.user);
}

async function issueOut(ctx) {
  const result = await inventoryService.issueOut(ctx.app.db, ctx.params.id, ctx.state.user);
  const [rows] = await ctx.app.db.query('SELECT * FROM material_issues WHERE id = ? LIMIT 1', [ctx.params.id]);
  if (rows.length) {
    const project = await projectService.getProjectRaw(ctx.app.db, rows[0].project_id);
    if (project.captain_user_id) {
      await notificationService.dispatch(ctx.app, {
        userIds: [project.captain_user_id],
        title: `材料已出库：${project.project_no}`,
        content: `项目 ${project.project_no} 的材料已出库，可开始施工。`,
        type: 'project', bizType: 'project', bizId: project.id,
      });
    }
  }
  ctx.body = result;
}

async function returnMaterials(ctx) {
  ctx.body = await inventoryService.returnMaterials(ctx.app.db, ctx.params.id, ctx.request.body || {}, ctx.state.user);
}

function mount(router) {
  router.get('/erp/api/inventory/stocks', auth, storeTeam, listStocks);
  router.post('/erp/api/inventory/stocks/adjust', auth, managers, adjust);
  router.get('/erp/api/inventory/low-stock', auth, staff, lowStock);
  router.get('/erp/api/inventory/issues', auth, staff, listIssues);
  router.post('/erp/api/inventory/issues', auth, storeTeam, createIssue);
  router.post('/erp/api/inventory/issues/:id/approve', auth, managers, approve);
  router.post('/erp/api/inventory/issues/:id/out', auth, managers, issueOut);
  router.post('/erp/api/inventory/issues/:id/return', auth, managers, returnMaterials);
  router.get('/erp/api/inventory/movements', auth, managers, listMovements);
}

module.exports = { mount };
