'use strict';

const projectService = require('../project/service');
const financeService = require('../finance/service');
const inventoryService = require('../inventory/service');
const salesService = require('../sales/service');
const notificationService = require('../notification/service');
const { assertProject } = require('../common/scope');
const { badRequest } = require('../common/http');

const PROJECT_NO = /PJ\d{6}-\d{4}/i;

const STAGE_LABEL = {
  created: '待勘测', surveying: '勘测中', surveyed: '已勘测', quoted: '已报价',
  contracted: '已签约', material_issued: '已领料', constructing: '施工中',
  constructed: '施工完成', accepted: '已验收待并网', grid_connected: '已并网',
  settled: '已结清', closed: '已闭环',
};

const moneyText = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * 轻量 Agent：只做意图解析 + 调用各业务域 service，不直接写库。
 */
async function chat(app, message, user) {
  const text = String(message || '').trim();
  if (!text) badRequest('message_required');

  const projectNo = text.match(PROJECT_NO);
  if (projectNo) return projectSummary(app, projectNo[0].toUpperCase(), user);

  if (/待并网|并网/.test(text)) return gridPending(app, text, user);
  if (/应收|待收|收款|逾期|尾款/.test(text)) return receivables(app, user);
  if (/库存|缺货|预警/.test(text)) return stockWarning(app, user);
  if (/今日销售|销售汇总|营业额|今天.*(卖|单)/.test(text)) return todaySales(app, user);
  if (/项目|进度|工单|摘要/.test(text)) return projectOverview(app, user);

  return {
    reply: [
      '我可以帮你做这些事：',
      '1. 列出待并网项目并发给施工队长（例：帮我列出所有待并网项目，发给施工队长）',
      '2. 查询应收与逾期款项（例：有哪些待收款）',
      '3. 库存预警（例：哪些产品库存不足）',
      '4. 今日销售汇总（例：今天的销售情况）',
      '5. 项目进度 / 方案摘要（例：PJ202611-0001 的方案摘要）',
    ].join('\n'),
    data: null,
    actions: [],
  };
}

function notificationTarget(text) {
  if (/施工队长|施工队|队长/.test(text)) return { roles: ['construction_captain'], label: '施工队长' };
  if (/工程师/.test(text)) return { roles: ['electrical_engineer', 'structural_engineer'], label: '工程师' };
  if (/店长/.test(text)) return { roles: ['store_manager'], label: '店长' };
  return null;
}

async function gridPending(app, text, user) {
  const result = await projectService.listProjects(app.db, { status: 'accepted', page_size: 100 }, user);
  const projects = result.items;
  const lines = projects.length
    ? projects.map((row) => `- ${row.project_no} ${row.customer_name}（${row.customer_address || '地址待补'}）`)
    : ['当前没有待并网项目。'];
  const actions = [];
  const target = notificationTarget(text);
  if (projects.length && target && /发给|通知|推送|提醒/.test(text)) {
    await notificationService.dispatch(app, {
      roles: target.roles,
      title: `待并网项目提醒（${projects.length} 个）`,
      content: lines.join('\n'),
      type: 'project',
      bizType: 'project',
      pushExternal: true,
    });
    actions.push({ type: 'notify', target: target.label, count: projects.length });
  }
  return {
    reply: [
      `已找到 ${projects.length} 个待并网项目：`,
      ...lines,
      ...(actions.length ? ['', `已推送给${target.label}。`] : []),
    ].join('\n'),
    data: { items: projects },
    actions,
  };
}

async function receivables(app, user) {
  const summary = await financeService.outstandingSummary(app.db, user);
  const items = summary.items.slice(0, 10);
  const lines = items.map((row) => {
    const outstanding = Number(row.amount) - Number(row.received_amount);
    const overdue = Number(row.overdue_days) > 0 ? `，逾期 ${row.overdue_days} 天` : '';
    return `- ${row.project_no || '-'} ${row.customer_name || ''} ${row.name} 待收 ${moneyText(outstanding)}${overdue}`;
  });
  return {
    reply: [
      `当前待收款合计 ${moneyText(summary.total)}，共 ${summary.items.length} 笔，其中逾期 ${summary.overdue.length} 笔。`,
      ...(lines.length ? ['', ...lines] : []),
    ].join('\n'),
    data: summary,
    actions: [],
  };
}

async function stockWarning(app, user) {
  const rows = await inventoryService.lowStock(app.db, user);
  const lines = rows.slice(0, 15).map((row) => (
    `- ${row.product_name}（${row.store_name || '门店'}）库存 ${row.qty}${row.unit}，安全库存 ${row.safety_qty}`
  ));
  return {
    reply: rows.length
      ? [`共 ${rows.length} 个产品低于安全库存：`, ...lines].join('\n')
      : '所有产品库存都在安全线以上。',
    data: { items: rows },
    actions: [],
  };
}

async function todaySales(app, user) {
  const summary = await salesService.todaySummary(app.db, user);
  return {
    reply: `今日销售单 ${summary.count} 单，合计 ${moneyText(summary.amount)}。`,
    data: summary,
    actions: [],
  };
}

async function projectOverview(app, user) {
  const rows = await projectService.statusSummary(app.db, user);
  const lines = rows.map((row) => `- ${STAGE_LABEL[row.status] || row.status}：${row.total} 个`);
  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  return {
    reply: [`当前项目共 ${total} 个，按阶段分布：`, ...(lines.length ? lines : ['- 暂无项目'])].join('\n'),
    data: { items: rows },
    actions: [],
  };
}

async function projectSummary(app, projectNo, user) {
  const row = await projectService.getProjectByNo(app.db, projectNo);
  if (!row) {
    return { reply: `没有找到项目 ${projectNo}，请确认项目编号。`, data: null, actions: [] };
  }
  assertProject(user, row);
  const bundle = await projectService.getProjectBundle(app.db, row.id, user);
  const finance = await financeService.getProjectFinance(app.db, row.id);
  const latestQuote = bundle.quotes[0];
  const lines = [
    `项目 ${bundle.project.project_no}｜客户 ${bundle.project.customer_name}｜当前阶段「${STAGE_LABEL[bundle.project.status] || bundle.project.status}」`,
    bundle.project.customer_address ? `安装地址：${bundle.project.customer_address}` : null,
    bundle.survey ? `勘测：${bundle.survey.roof_type || '屋顶'} ${bundle.survey.roof_area || 0}㎡（${bundle.survey.engineer_name || '未指派'}）` : '勘测：尚未录入',
    latestQuote ? `最新报价 ${latestQuote.quote_no}：${moneyText(latestQuote.final_amount)}（${latestQuote.status}）` : '报价：尚未录入',
    bundle.contract ? `合同 ${bundle.contract.contract_no}：${moneyText(bundle.contract.amount)}` : '合同：尚未签订',
    `财务：应收 ${moneyText(finance.totals.receivable)}／已收 ${moneyText(finance.totals.received)}／成本 ${moneyText(finance.totals.cost)}`,
    bundle.warranty ? `质保：${bundle.warranty.warranty_no}（${bundle.warranty.start_date} 至 ${bundle.warranty.end_date}）` : null,
  ].filter(Boolean);
  return {
    reply: lines.join('\n'),
    data: { project: bundle.project, quote: latestQuote || null, finance: finance.totals, warranty: bundle.warranty },
    actions: [],
  };
}

module.exports = { chat, STAGE_LABEL };
