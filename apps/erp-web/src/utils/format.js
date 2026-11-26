export const STAGE_LABEL = {
  created: '待勘测', surveying: '勘测中', surveyed: '已勘测', quoted: '已报价',
  contracted: '已签约', material_issued: '已领料', constructing: '施工中',
  constructed: '施工完成', accepted: '已验收待并网', grid_connected: '已并网',
  settled: '已结清', closed: '已闭环',
};

export const STAGE_TYPE = {
  created: 'info', surveying: 'warning', surveyed: 'warning', quoted: 'primary',
  contracted: 'success', material_issued: 'success', constructing: 'warning',
  constructed: 'success', accepted: 'warning', grid_connected: 'success',
  settled: 'success', closed: 'info',
};

export const ROLE_LABEL = {
  admin: '管理员', store_manager: '店长', store_clerk: '门店店员',
  electrical_engineer: '电气工程师', structural_engineer: '结构工程师',
  construction_captain: '施工队长',
};

export const ORDER_STATUS = { draft: '草稿', confirmed: '已确认', cancelled: '已作废' };
export const QUOTE_STATUS = { pending: '待审批', approved: '已通过', rejected: '已驳回' };
export const ISSUE_STATUS = { draft: '待审批', approved: '已审批', issued: '已出库' };
export const PAY_STATUS = { pending: '待收款', partial: '部分收款', paid: '已结清', void: '已作废' };

export const money = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const paymentMethodLabel = (value) => ({
  cash: '现金', bank: '银行转账', wechat: '微信', alipay: '支付宝', payment_gateway: '支付渠道',
}[value] || value);
