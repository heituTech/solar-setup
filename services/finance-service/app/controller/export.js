'use strict';

const ExcelJS = require('exceljs');
const { num } = require('../../lib/finance');

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dateStr(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function fillSheet(sheet, headers, rows, widths, formats) {
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };
  for (const row of rows) sheet.addRow(row);
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = widths[index] || 14;
    if (formats && formats[index]) column.numFmt = formats[index];
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

module.exports = {
  async exportLedger(ctx) {
    const period = String(ctx.query.period || '');
    const validPeriod = /^\d{4}-\d{2}$/.test(period);

    const ledgerParams = [];
    let ledgerWhere = 'WHERE 1 = 1';
    if (validPeriod) {
      ledgerWhere += " AND DATE_FORMAT(COALESCE(l.deal_date, l.created_at), '%Y-%m') = ?";
      ledgerParams.push(period);
    }
    const [ledgerRows] = await ctx.app.db.query(
      `SELECT l.* FROM order_ledger l ${ledgerWhere} ORDER BY l.id`, ledgerParams
    );

    const [surveyRows] = await ctx.app.db.query(
      `SELECT * FROM survey_records ${validPeriod ? "WHERE DATE_FORMAT(survey_date, '%Y-%m') = ?" : ''} ORDER BY id`,
      validPeriod ? [period] : []
    );

    const [settlementRows] = await ctx.app.db.query(
      `SELECT * FROM settlements ${validPeriod ? 'WHERE period = ?' : ''} ORDER BY id`,
      validPeriod ? [period] : []
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'solar-setup';
    workbook.created = new Date();

    const info = workbook.addWorksheet('说明');
    fillSheet(info, ['项目', '说明'], [
      ['导出范围', period || '全部'],
      ['导出时间', new Date().toISOString()],
      ['订单台账', '24 列；金额 USD，来源于订单、项目、回款与提成的实时投影'],
      ['勘测记录', '当月勘测审核记录；有效勘测数量用于勤奋奖判定'],
      ['月度结算', '底薪、两阶段提成、首单/转介绍/勤奋/销冠奖、扣款与应发合计'],
    ], [18, 80]);

    fillSheet(workbook.addWorksheet('订单台账'), [
      'Order No', '成交日期', '销售员', '客户名称', '电话', '订单类型', '产品与配置',
      '合同金额USD', '折扣批准人', '定金USD', '定金到账', '尾款USD', '尾款到账', '累计回款',
      '提成费率', '订单总提成', '定金阶段应发', '结清阶段应发', '已发提成', '待发提成',
      '交付日期', '状态', '转介绍', '备注',
    ], ledgerRows.map((row) => [
      row.order_no,
      dateStr(row.deal_date || row.created_at),
      row.salesperson_name || '',
      row.customer_name,
      row.customer_phone || '',
      row.order_type === 'engineering' ? '工程' : '零售',
      row.product_config || '',
      num(row.order_amount),
      row.discount_approver || '',
      num(row.deposit_amount),
      Number(row.deposit_received) ? '是' : '否',
      num(row.balance_amount),
      Number(row.balance_received) ? '是' : '否',
      num(row.received_amount),
      num(row.commission_rate),
      num(row.commission_amount),
      num(row.deposit_commission),
      num(row.settlement_commission),
      num(row.paid_commission),
      round2(num(row.commission_amount) - num(row.paid_commission)),
      dateStr(row.delivery_date),
      row.status,
      Number(row.referral_flag) ? (row.referral_name || '是') : '',
      row.note || '',
    ]), [20, 14, 14, 20, 16, 12, 30, 14, 14, 12, 12, 12, 12, 14, 12, 14, 14, 14, 14, 14, 14, 14, 16, 24],
    [0, 0, 0, 0, 0, 0, 0, '#,##0.00', 0, '#,##0.00', 0, '#,##0.00', 0, '#,##0.00',
      0, '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', 0, 0, 0, 0]
    );
    workbook.getWorksheet('订单台账').getColumn(15).numFmt = '0.00%';

    fillSheet(workbook.addWorksheet('勘测记录'), [
      '日期', '销售员', '客户', '地址', '现场照片编号', '客户确认方式', '需求摘要', '是否有效', '备注',
    ], surveyRows.map((row) => [
      dateStr(row.survey_date || row.created_at),
      row.salesperson_name || '',
      row.customer_name || '',
      row.address || '',
      row.photo_refs || '',
      row.confirm_method || '',
      row.requirement_summary || '',
      Number(row.is_valid) ? '是' : '否',
      row.note || '',
    ]), [14, 14, 20, 30, 18, 18, 36, 12, 24]);

    fillSheet(workbook.addWorksheet('月度结算'), [
      '销售员', '底薪', '定金阶段提成', '结清阶段提成', '提成小计', '首单奖', '转介绍奖',
      '勤奋奖', '销冠奖', '扣款', '应发合计', '签字', '备注',
    ], settlementRows.map((row) => [
      row.user_name || '',
      num(row.base_salary),
      num(row.deposit_commission_total),
      num(row.settlement_commission_total),
      num(row.commission_total),
      num(row.first_order_reward),
      num(row.referral_reward),
      num(row.diligence_reward),
      num(row.champion_reward),
      num(row.deduction_total),
      num(row.payable),
      '',
      '',
    ]), [16, 12, 14, 14, 14, 12, 12, 12, 12, 12, 14, 12, 24],
    [0, '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00',
      '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', 0, 0]
    );

    const buffer = await workbook.xlsx.writeBuffer();
    ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    ctx.set('Content-Disposition', `attachment; filename="ledger-${period || 'all'}.xlsx"`);
    ctx.body = Buffer.from(buffer);
  },
};
