import { createI18n } from 'vue-i18n';
import legacy from './legacy';

const en = {
  workspace: 'Business workbench', overview: 'Overview', customers: 'Customers', leads: 'Leads', surveys: 'Site surveys', quotes: 'Quotes', orders: 'Orders', projects: 'Projects & devices', payments: 'Payments & commissions', ledger: 'Sales ledger', settlements: 'Monthly payroll', tickets: 'After-sales', integrations: 'Service health', login: 'Sign in', logout: 'Sign out', register: 'Register', create: 'Create', save: 'Save', actions: 'Actions', refresh: 'Refresh', cancel: 'Cancel', confirm: 'Confirm', detail: 'Detail', status: 'Status', name: 'Name', phone: 'Phone', email: 'Email', address: 'Address', source: 'Source', owner: 'Owner', amount: 'Amount', currency: 'Currency', total: 'Total', notes: 'Notes', noData: 'No records', operationSuccess: 'Saved successfully', role: 'Role', language: 'Language', memberCases: 'My cases', admin: 'Administration', account: 'Account', home: 'Home', configurator: 'Configurator', salesChain: 'Lead → Quote → Order → Project → Acceptance → Payment → After-sales', mvpIntro: 'One traceable workflow for sales, delivery and finance.', newCustomer: 'New customer', newLead: 'New lead', newSurvey: 'New survey', newQuote: 'New quote', addItem: 'Add item', submitReview: 'Submit for review', approve: 'Approve', reject: 'Reject', accept: 'Accept', convertOrder: 'Convert to order', assign: 'Assign', startProject: 'Start project', finalAcceptance: 'Final acceptance', payment: 'Payment', refund: 'Refund', payout: 'Commission payout', void: 'Void', createTicket: 'Create ticket', resolve: 'Resolve', close: 'Close', review: 'Review', valid: 'Valid', invalid: 'Invalid', rewardMode: 'Reward mode', selfCommission: 'Self commission', referral: 'Referral 1%', contractUsd: 'Contract USD basis', installationFee: 'Installation fee', items: 'Items', product: 'Product / description', quantity: 'Qty', unitPrice: 'Unit price', customer360: 'Customer 360', timeline: 'Timeline', month: 'Month', settle: 'Generate settlement', reopen: 'Reopen', service: 'Service', healthy: 'Healthy', unhealthy: 'Unavailable', requestId: 'Request ID', password: 'Password', identifier: 'Username, email or phone', welcome: 'Welcome', delivery: 'Delivery', finance: 'Finance', sales: 'Sales', identity: 'Identity', devices: 'Devices', serialNumber: 'Serial number', delivered: 'Delivered', installed: 'Installed', electricalReview: 'Electrical review', structuralReview: 'Structural review', resolution: 'Resolution', title: 'Title', description: 'Description', type: 'Type', date: 'Date', reference: 'Reference', netReceived: 'Net received', outstanding: 'Outstanding', commissionDue: 'Commission due', paid: 'Paid', recover: 'Recoverable', settings: 'Settings', catalog: 'Catalog', users: 'Users', approvals: 'Approvals', flows: 'Approval flows', all: 'All', search: 'Search', active: 'Active', disabled: 'Disabled', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', optional: 'Optional', firstOrderReward: 'First order reward', surveyReward: 'Survey diligence reward', baseSalary: 'Base salary', adjustments: 'Adjustments', integrationHint: 'Events are retried automatically. Failed events require an administrator retry.', retryFailed: 'Retry failed events', caseName: 'Case name', usageScenario: 'Usage scenario', installType: 'Installation type', systemMode: 'System mode', gridAvailable: 'Grid available', rooftop: 'Rooftop', ground: 'Ground', offGrid: 'Off-grid', hybrid: 'Hybrid', delete: 'Delete', edit: 'Edit', quoteSnapshot: 'Quote snapshot', selectCustomer: 'Select customer', selectLead: 'Select lead', selectProject: 'Select project', selectOrder: 'Select order', electricalEngineer: 'Electrical engineer', structuralEngineer: 'Structural engineer', staffId: 'Staff ID', acceptedAt: 'Accepted at', surveyDate: 'Survey date', validSurvey: 'Valid survey', basisEvidence: 'USD basis evidence', recordBasis: 'Confirm USD basis', payrollSnapshot: 'Payroll snapshot', mySummary: 'My performance', quoteNumber: 'Quote number', orderNumber: 'Order number', projectNumber: 'Project number', noPermission: 'Your role does not have access to this page.',
};
const zh = {
  workspace: '业务工作台', overview: '总览', customers: '客户', leads: '线索', surveys: '现场勘测', quotes: '报价', orders: '订单', projects: '项目与设备', payments: '回款与提成', ledger: '订单台账', settlements: '月度薪酬', tickets: '售后工单', integrations: '服务健康', login: '登录', logout: '退出登录', register: '注册', create: '新建', save: '保存', actions: '操作', refresh: '刷新', cancel: '取消', confirm: '确认', detail: '详情', status: '状态', name: '姓名', phone: '手机号', email: '邮箱', address: '地址', source: '来源', owner: '负责人', amount: '金额', currency: '币种', total: '合计', notes: '备注', noData: '暂无记录', operationSuccess: '操作成功', role: '角色', language: '语言', memberCases: '我的 Case', admin: '系统管理', account: '账号', home: '首页', configurator: '配置器', salesChain: '线索 → 报价 → 订单 → 项目 → 验收 → 回款 → 售后', mvpIntro: '销售、交付、财务共用一条可追溯业务链。', newCustomer: '新建客户', newLead: '新建线索', newSurvey: '新建勘测', newQuote: '新建报价', addItem: '添加明细', submitReview: '提交审核', approve: '通过', reject: '驳回', accept: '客户接受', convertOrder: '转为订单', assign: '分配', startProject: '启动项目', finalAcceptance: '最终验收', payment: '回款', refund: '退款', payout: '提成实发', void: '作废', createTicket: '新建工单', resolve: '解决', close: '关闭', review: '审核', valid: '有效', invalid: '无效', rewardMode: '奖励方式', selfCommission: '本人销售提成', referral: '转介绍奖 1%', contractUsd: '合同 USD 业绩基数', installationFee: '安装费', items: '明细', product: '产品 / 描述', quantity: '数量', unitPrice: '单价', customer360: '客户 360', timeline: '时间线', month: '月份', settle: '生成月结', reopen: '重开', service: '服务', healthy: '正常', unhealthy: '不可用', requestId: '请求 ID', password: '密码', identifier: '用户名、邮箱或手机号', welcome: '欢迎', delivery: '交付', finance: '财务', sales: '销售', identity: '身份', devices: '设备', serialNumber: '序列号', delivered: '已交付', installed: '已安装', electricalReview: '电气审核', structuralReview: '结构审核', resolution: '处理结果', title: '标题', description: '描述', type: '类型', date: '日期', reference: '参考号', netReceived: '净回款', outstanding: '未回款', commissionDue: '应发提成', paid: '已发', recover: '应追回', settings: '参数', catalog: '商品', users: '用户', approvals: '审批', flows: '审批流', all: '全部', search: '搜索', active: '启用', disabled: '停用', pending: '待处理', approved: '已通过', rejected: '已驳回', optional: '可选', firstOrderReward: '首单奖', surveyReward: '勤奋奖', baseSalary: '底薪', adjustments: '奖惩调整', integrationHint: '事件自动重试；失败事件需管理员手工重试。', retryFailed: '重试失败事件', caseName: 'Case 名称', usageScenario: '使用场景', installType: '安装方式', systemMode: '系统模式', gridAvailable: '市电可用', rooftop: '屋顶', ground: '地面', offGrid: '离网', hybrid: '混合', delete: '删除', edit: '编辑', quoteSnapshot: '报价快照', selectCustomer: '选择客户', selectLead: '选择线索', selectProject: '选择项目', selectOrder: '选择订单', electricalEngineer: '电气工程师', structuralEngineer: '结构工程师', staffId: '员工 ID', acceptedAt: '验收时间', surveyDate: '勘测日期', validSurvey: '有效勘测', basisEvidence: 'USD 基数依据', recordBasis: '确认 USD 基数', payrollSnapshot: '薪酬快照', mySummary: '我的业绩', quoteNumber: '报价编号', orderNumber: '订单编号', projectNumber: '项目编号', noPermission: '当前角色无权访问此页面。',
};
const km = { workspace: 'ផ្ទាំងការងារ', overview: 'ទិដ្ឋភាពទូទៅ', customers: 'អតិថិជន', leads: 'ឱកាសលក់', surveys: 'ស្ទង់ទីតាំង', quotes: 'សម្រង់តម្លៃ', orders: 'ការបញ្ជាទិញ', projects: 'គម្រោង និងឧបករណ៍', payments: 'ការទូទាត់ និងកម្រៃជើងសារ', ledger: 'បញ្ជីលក់', settlements: 'បៀវត្សប្រចាំខែ', tickets: 'សេវាក្រោយលក់', login: 'ចូល', logout: 'ចាកចេញ', create: 'បង្កើត', save: 'រក្សាទុក', cancel: 'បោះបង់', confirm: 'បញ្ជាក់', status: 'ស្ថានភាព', name: 'ឈ្មោះ', phone: 'ទូរស័ព្ទ', address: 'អាសយដ្ឋាន', total: 'សរុប', customer360: 'អតិថិជន ៣៦០', timeline: 'លំដាប់ព្រឹត្តិការណ៍' };

Object.assign(en, {
  region: 'Region', roofType: 'Roof type', roofArea: 'Roof area (m²)', consumption: 'Monthly consumption (kWh)',
  stage: 'Stage', progress: 'Progress', priority: 'Priority', direction: 'Direction', item: 'Item',
  unit: 'Unit', paymentIn: 'Payment received', paymentRefund: 'Refund', assigned: 'Assigned',
  customerName: 'Customer', noAccess: 'Your role does not have access to this page.',
  commissionRate: 'Commission rate', receivedAmount: 'Received', orderAmount: 'Order amount',
  markResolved: 'Mark resolved', markClosed: 'Close ticket', start: 'Start installation', addDevice: 'Add device',
  category: 'Category', remaining: 'Remaining payment', latency: 'Latency', checkedAt: 'Checked at',
  recordPayment: 'Record payment', adjust: 'Adjustment', generateSettlement: 'Generate settlement',
  viewDetail: 'View detail', back: 'Back', selectProject: 'Select project', selectCustomer: 'Select customer',
  monthlySettlement: 'Monthly settlement', payoutStatus: 'Payout status', serviceHealth: 'Service health',
  caseSaved: 'Case saved', memberArea: 'Member area', myCases: 'My cases', accountInfo: 'Account',
  role_electrical_engineer: 'Electrical engineer', role_structural_engineer: 'Structural engineer',
  role_warehouse: 'Warehouse', role_accountant: 'Accountant', role_after_sales: 'After-sales',
  customerType: 'Customer type', retail: 'Retail', engineering: 'Engineering', orderType: 'Order type',
  productConfig: 'Product & configuration', dealDate: 'Deal date', deposit: 'Deposit',
  depositReceived: 'Deposit received', balance: 'Balance', balanceReceived: 'Balance received',
  paidCommission: 'Paid commission', pendingCommission: 'Pending commission', deliveryDate: 'Delivery date',
  exportLedger: 'Export ledger', depositCommission: 'Deposit-stage commission',
  settlementCommission: 'Settlement-stage commission', referralReward: 'Referral reward',
  diligenceReward: 'Diligence reward', championReward: 'Champion reward', deduction: 'Deduction',
  commissionSubtotal: 'Commission subtotal',
});
Object.assign(zh, {
  region: '地区', roofType: '屋顶类型', roofArea: '屋顶面积（㎡）', consumption: '月用电量（kWh）',
  stage: '阶段', progress: '进度', priority: '优先级', direction: '方向', item: '明细项',
  unit: '单位', paymentIn: '回款', paymentRefund: '退款', assigned: '已分配',
  customerName: '客户', noAccess: '当前角色无权访问此页面。',
  commissionRate: '提成比例', receivedAmount: '已回款', orderAmount: '订单金额',
  markResolved: '标记已解决', markClosed: '关闭工单', start: '开始安装', addDevice: '添加设备',
  category: '分类', remaining: '剩余回款', latency: '耗时', checkedAt: '检查时间',
  recordPayment: '登记回款', adjust: '奖惩调整', generateSettlement: '生成月结',
  viewDetail: '查看详情', back: '返回', selectProject: '选择项目', selectCustomer: '选择客户',
  monthlySettlement: '月度薪酬结算', payoutStatus: '发放状态', serviceHealth: '服务健康检查',
  caseSaved: 'Case 已保存', memberArea: '会员中心', myCases: '我的 Case', accountInfo: '账号信息',
  role_electrical_engineer: '电气工程师', role_structural_engineer: '结构工程师',
  role_warehouse: '仓库', role_accountant: '财务', role_after_sales: '售后',
  customerType: '客户类型', retail: '零售', engineering: '工程', orderType: '订单类型',
  productConfig: '产品与配置', dealDate: '成交日期', deposit: '定金',
  depositReceived: '定金到账', balance: '尾款', balanceReceived: '尾款到账',
  paidCommission: '已发提成', pendingCommission: '待发提成', deliveryDate: '交付日期',
  exportLedger: '导出台账', depositCommission: '定金阶段提成',
  settlementCommission: '结清阶段提成', referralReward: '转介绍奖',
  diligenceReward: '勤奋奖', championReward: '销冠奖', deduction: '扣款',
  commissionSubtotal: '提成小计',
});

Object.assign(en, {
  businessChain: 'Business chain',
  heroDescription: 'Customer leads, site surveys, quote approvals, order-to-project conversion, dual-discipline delivery, acceptance & payment, and after-sales tickets all run on one chain, with an event trail at every step.',
  featureCustomerSurveys: 'Leads belong to the sales owner; survey submissions are reviewed by the electrical engineer. Customer 360 aggregates surveys, quotes and orders.',
  featureQuotesOrders: 'Quotes are approved by the sales manager and converted to orders once the customer accepts; orders are dispatched to delivery to create projects.',
  featureProjectsAcceptance: 'Electrical and structural engineers work in parallel with trackable device status; final acceptance triggers commission calculation.',
  featurePaymentLedger: 'Finance records payments; the ledger derives outstanding balance and payable commission automatically. Settlement is available only after full payment and acceptance.',
  featureSettlements: 'Generate monthly payroll with base salary, commissions and reward/deduction adjustments, then confirm and pay out.',
  featureTickets: 'After-sales tickets created after acceptance link to projects and devices, and their progress syncs back to the sales order.',
  share: 'Share',
  noRecords: 'No records',
});
Object.assign(zh, {
  businessChain: '业务链路',
  heroDescription: '客户线索、现场勘测、报价审批、订单转项目、双专业交付、验收回款与售后工单在同一条链路上流转，每一步都有事件留痕。',
  featureCustomerSurveys: '线索归属销售，勘测提交后由电气工程师审核；客户 360 汇总勘测、报价与订单。',
  featureQuotesOrders: '报价经销售经理审批、客户接受后转订单，订单自动下发到交付服务创建项目。',
  featureProjectsAcceptance: '电气与结构工程师共同推进，设备状态可追踪；最终验收触发提成计算。',
  featurePaymentLedger: '财务登记回款，台账自动计算未回款与应发提成，全部结清且验收后才可结算。',
  featureSettlements: '按月份生成薪酬结算单，含底薪、提成与奖惩调整，支持确认与发放。',
  featureTickets: '验收后的售后工单可关联项目与设备，处理进度同步回销售订单。',
  share: '分享',
  noRecords: '暂无记录',
});

const messages = {};
for (const lang of Object.keys(legacy)) messages[lang] = { ...en, ...(lang === 'zh' ? zh : lang === 'km' ? km : {}), ...legacy[lang] };
if (!messages.en) messages.en = en;

export const languages = [
  ['en', 'English'], ['zh', '中文'], ['km', 'ខ្មែរ'], ['es', 'Español'], ['de', 'Deutsch'],
  ['fr', 'Français'], ['ja', '日本語'], ['ko', '한국어'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'],
];
export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'),
  fallbackLocale: 'en',
  messages,
});
