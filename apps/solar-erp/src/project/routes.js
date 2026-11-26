'use strict';

const { auth, roles } = require('../common/auth');
const { withTransaction } = require('../common/db');
const { actorOf } = require('../common/http');
const projectService = require('./service');
const financeService = require('../finance/service');
const inventoryService = require('../inventory/service');
const notificationService = require('../notification/service');

const storeTeam = roles('store_manager', 'store_clerk');
const managers = roles('store_manager');
const surveyTeam = roles('store_manager', 'store_clerk', 'electrical_engineer', 'structural_engineer');
const captains = roles('construction_captain');

async function listProjects(ctx) {
  ctx.body = await projectService.listProjects(ctx.app.db, ctx.query, ctx.state.user);
}

async function getProjectDetail(ctx) {
  const id = Number(ctx.params.id);
  const user = ctx.state.user;
  const bundle = await projectService.getProjectBundle(ctx.app.db, id, user);
  const finance = await financeService.getProjectFinance(ctx.app.db, id);
  const issues = await inventoryService.listIssues(ctx.app.db, { project_id: id, page_size: 100 }, user);

  const entityIds = [
    id,
    bundle.survey ? bundle.survey.id : null,
    ...bundle.quotes.map((quote) => quote.id),
    bundle.contract ? bundle.contract.id : null,
    bundle.acceptance ? bundle.acceptance.id : null,
    bundle.warranty ? bundle.warranty.id : null,
  ].filter(Boolean);
  const [audits] = await ctx.app.db.query(
    `SELECT id, module, entity, entity_id, action, actor_name, before_json, after_json, remark, created_at
     FROM audit_logs WHERE module = 'project' AND entity_id IN (${entityIds.map(() => '?').join(',')})
     ORDER BY id DESC LIMIT 100`,
    entityIds.map(String)
  );

  const fileConds = ["(biz_type = 'project' AND biz_id = ?)"];
  const fileParams = [id];
  if (bundle.survey) { fileConds.push("(biz_type = 'survey' AND biz_id = ?)"); fileParams.push(bundle.survey.id); }
  if (bundle.contract) { fileConds.push("(biz_type = 'contract' AND biz_id = ?)"); fileParams.push(bundle.contract.id); }
  if (bundle.acceptance) { fileConds.push("(biz_type = 'acceptance' AND biz_id = ?)"); fileParams.push(bundle.acceptance.id); }
  const [files] = await ctx.app.db.query(
    `SELECT id, file_no, filename, mime, size, biz_type, biz_id, uploaded_by_name, created_at
     FROM files WHERE ${fileConds.join(' OR ')} ORDER BY id DESC`,
    fileParams
  );

  ctx.body = {
    ...bundle,
    finance,
    issues: issues.items,
    files: files.map((row) => ({ ...row, url: `/erp/api/files/${row.id}` })),
    audits,
  };
}

async function updateCustomer(ctx) {
  ctx.body = await projectService.updateCustomer(ctx.app.db, ctx.params.id, ctx.request.body || {}, ctx.state.user);
}

async function listCustomers(ctx) {
  ctx.body = await projectService.listCustomers(ctx.app.db, ctx.query, ctx.state.user);
}

async function createCustomer(ctx) {
  const actor = { ...actorOf(ctx), store_id: ctx.state.user.store_id };
  ctx.body = await withTransaction(ctx.app.db, (conn) => projectService.createCustomer(conn, ctx.request.body || {}, actor));
  ctx.status = 201;
}

async function saveSurvey(ctx) {
  ctx.body = await projectService.saveSurvey(ctx.app.db, Number(ctx.params.id), ctx.request.body || {}, ctx.state.user);
}

async function submitSurvey(ctx) {
  const result = await projectService.submitSurvey(ctx.app.db, Number(ctx.params.id), ctx.state.user);
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `勘测已提交：${project.project_no}`,
    content: `客户 ${project.customer_name} 的勘测信息已由 ${ctx.state.user.name} 提交，可继续录入方案报价。`,
    type: 'project', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function createQuote(ctx) {
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  const result = await projectService.createQuote(ctx.app.db, project.id, ctx.request.body || {}, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `报价待审批：${project.project_no}`,
    content: `${ctx.state.user.name} 提交了项目 ${project.project_no} 的报价，金额 ${result.final_amount}，请审批。`,
    type: 'project', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function approveQuote(ctx) {
  ctx.body = await projectService.approveQuote(
    ctx.app.db, Number(ctx.params.id), Number(ctx.params.quoteId), ctx.state.user
  );
}

async function signContract(ctx) {
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  const result = await projectService.signContract(ctx.app.db, project.id, ctx.request.body || {}, ctx.state.user);
  await financeService.createReceivablesForPlans(ctx.app.db, project.id);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `合同已签订：${project.project_no}`,
    content: `合同金额 ${result.amount}，已生成定金/进度款/尾款收款计划，可安排领料施工。`,
    type: 'finance', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function startConstruction(ctx) {
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  const result = await projectService.startConstruction(ctx.app.db, project.id, ctx.request.body || {}, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    userIds: [result.captain_user_id],
    title: `新施工任务：${project.project_no}`,
    content: `客户 ${project.customer_name}（${project.customer_address || '地址待补'}）已指派你为施工队长。`,
    type: 'project', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function addConstructionLog(ctx) {
  ctx.body = await projectService.addConstructionLog(
    ctx.app.db, Number(ctx.params.id), ctx.request.body || {}, ctx.state.user
  );
}

async function completeConstruction(ctx) {
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  const result = await projectService.completeConstruction(ctx.app.db, project.id, ctx.request.body || {}, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `施工完成：${project.project_no}`,
    content: `客户 ${project.customer_name} 的项目已施工完成，请安排验收与并网资料上传。`,
    type: 'project', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function createAcceptance(ctx) {
  const project = await projectService.getProjectRaw(ctx.app.db, ctx.params.id);
  const result = await projectService.createAcceptance(ctx.app.db, project.id, ctx.request.body || {}, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager'], storeId: project.store_id,
    title: `验收完成：${project.project_no}`,
    content: `客户 ${project.customer_name} 已验收，并网状态：${result.grid_status}。`,
    type: 'project', bizType: 'project', bizId: project.id,
  });
  ctx.body = result;
}

async function dashboard(ctx) {
  const user = ctx.state.user;
  const [statuses, sales, receipts, lowStock, outstanding] = await Promise.all([
    projectService.statusSummary(ctx.app.db, user),
    require('../sales/service').todaySummary(ctx.app.db, user),
    financeService.todayReceiptsSummary(ctx.app.db, user),
    inventoryService.lowStock(ctx.app.db, user),
    financeService.outstandingSummary(ctx.app.db, user),
  ]);
  ctx.body = {
    statuses,
    sales_today: sales,
    receipts_today: receipts,
    low_stock: lowStock.length,
    low_stock_items: lowStock.slice(0, 5),
    outstanding: outstanding.total,
    outstanding_items: outstanding.items.slice(0, 5),
  };
}

function mount(router) {
  router.get('/erp/api/project/customers', auth, storeTeam, listCustomers);
  router.post('/erp/api/project/customers', auth, storeTeam, createCustomer);
  router.patch('/erp/api/project/customers/:id', auth, storeTeam, updateCustomer);

  router.get('/erp/api/project/projects', auth, listProjects);
  router.get('/erp/api/project/dashboard', auth, dashboard);
  router.get('/erp/api/project/projects/:id', auth, getProjectDetail);

  router.post('/erp/api/project/projects/:id/survey', auth, surveyTeam, saveSurvey);
  router.post('/erp/api/project/projects/:id/survey/submit', auth, surveyTeam, submitSurvey);

  router.post('/erp/api/project/projects/:id/quotes', auth, storeTeam, createQuote);
  router.post('/erp/api/project/projects/:id/quotes/:quoteId/approve', auth, managers, approveQuote);

  router.post('/erp/api/project/projects/:id/contract', auth, managers, signContract);

  router.post('/erp/api/project/projects/:id/construction', auth, managers, startConstruction);
  router.post('/erp/api/project/projects/:id/construction/logs', auth, captains, addConstructionLog);
  router.post('/erp/api/project/projects/:id/construction/complete', auth, captains, completeConstruction);

  router.post('/erp/api/project/projects/:id/acceptance', auth, managers, createAcceptance);
}

module.exports = { mount };
