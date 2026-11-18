'use strict';

const { internalFetch } = require('@solar/service-kit');
const { buildPerformance, round2 } = require('./performance');
const { assertPeriod } = require('./rules');
const { sendMail } = require('./mailer');

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function money(value) {
  return `$${round2(value).toFixed(2)}`;
}

function tableRows(rows, columns) {
  return rows.map((row) => `<tr>${columns.map((column) => `<td style="padding:8px;border-bottom:1px solid #eee">${column(row)}</td>`).join('')}</tr>`).join('');
}

function renderPersonal(row, period) {
  const subject = `【HEITU ERP】${period} 个人业绩报告 - ${row.name || ''}`;
  const actual = row.actual_settlement
    ? `财务结算实发：${money(row.actual_settlement.payable)}（状态：${escapeHtml(row.actual_settlement.status)}）`
    : '财务结算单尚未生成，以下为按提成规则测算的预估应发。';
  const text = [
    `${period} 个人业绩报告`,
    `姓名：${row.name || ''}`,
    `销售额：${money(row.order_amount)}`,
    `回款额：${money(row.received_amount)}`,
    `新增客户：${row.new_customers}`,
    `成交单数：${row.order_count}`,
    `提成：${money(row.commission)}`,
    `转介绍奖：${money(row.referral_reward)}`,
    `首单奖：${money(row.first_order_reward)}`,
    `勤奋奖：${money(row.diligence_reward)}`,
    row.is_champion ? `销冠奖：${money(row.champion_reward)}` : null,
    `其他奖励：${money(row.award_total)}`,
    `扣款：${money(row.deduction_total)}`,
    `底薪：${money(row.base_salary)}`,
    `预估应发：${money(row.estimated_payable)}`,
    actual,
    '说明：预估金额按当月提成规则测算，最终以财务结算为准。',
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:720px;margin:0 auto">
      <h2 style="color:#1f6f5c">${period} 个人业绩报告</h2>
      <p>${escapeHtml(row.name || '')}，以下是您本月的业绩与提成测算：</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;background:#f6f8f7">销售额</td><td style="padding:8px">${money(row.order_amount)}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">回款额</td><td style="padding:8px">${money(row.received_amount)}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">新增客户</td><td style="padding:8px">${row.new_customers}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">成交单数</td><td style="padding:8px">${row.order_count}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">提成</td><td style="padding:8px">${money(row.commission)}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">转介绍奖</td><td style="padding:8px">${money(row.referral_reward)}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">首单奖 / 勤奋奖</td><td style="padding:8px">${money(row.first_order_reward)} / ${money(row.diligence_reward)}</td></tr>
        ${row.is_champion ? `<tr><td style="padding:8px;background:#f6f8f7">销冠奖</td><td style="padding:8px">${money(row.champion_reward)}</td></tr>` : ''}
        <tr><td style="padding:8px;background:#f6f8f7">其他奖励 / 扣款</td><td style="padding:8px">${money(row.award_total)} / ${money(row.deduction_total)}</td></tr>
        <tr><td style="padding:8px;background:#f6f8f7">底薪</td><td style="padding:8px">${money(row.base_salary)}</td></tr>
        <tr><td style="padding:8px;background:#e8f3ef;font-weight:bold">预估应发</td><td style="padding:8px;font-weight:bold">${money(row.estimated_payable)}</td></tr>
      </table>
      <p style="color:#666">${escapeHtml(actual)}</p>
      <p style="color:#999;font-size:12px">说明：预估金额按当月提成规则测算，最终以财务结算为准。</p>
    </div>`;
  return { subject, text, html };
}

function renderTeam(team, period) {
  const columns = [
    (row) => escapeHtml(row.name || ''),
    (row) => money(row.order_amount),
    (row) => money(row.received_amount),
    (row) => row.new_customers,
    (row) => money(row.commission),
    (row) => money(row.estimated_payable),
  ];
  const champion = team.champion
    ? `${team.champion.name || team.champion.salesperson_id}（${money(team.champion.value)}）`
    : '无';
  const subject = `【HEITU ERP】${period} 销售团队业绩报告`;
  const text = [
    `${period} 销售团队业绩报告`,
    `总销售额：${money(team.total_sales)}`,
    `总回款额：${money(team.total_received)}`,
    `新增客户数：${team.new_customers}`,
    `成交单数：${team.order_count}`,
    `当月销冠：${champion}`,
    '',
    ...team.rows.map((row) => `${row.name || row.salesperson_id}：销售额 ${money(row.order_amount)}，回款 ${money(row.received_amount)}，提成 ${money(row.commission)}，预估应发 ${money(row.estimated_payable)}`),
    '',
    '说明：预估金额按当月提成规则测算，最终以财务结算为准。',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:900px;margin:0 auto">
      <h2 style="color:#1f6f5c">${period} 销售团队业绩报告</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="padding:12px;background:#f6f8f7"><div style="color:#666;font-size:12px">总销售额</div><div style="font-size:20px;font-weight:bold">${money(team.total_sales)}</div></td>
          <td style="padding:12px;background:#f6f8f7"><div style="color:#666;font-size:12px">总回款额</div><div style="font-size:20px;font-weight:bold">${money(team.total_received)}</div></td>
          <td style="padding:12px;background:#f6f8f7"><div style="color:#666;font-size:12px">新增客户数</div><div style="font-size:20px;font-weight:bold">${team.new_customers}</div></td>
          <td style="padding:12px;background:#f6f8f7"><div style="color:#666;font-size:12px">成交单数</div><div style="font-size:20px;font-weight:bold">${team.order_count}</div></td>
        </tr>
      </table>
      <p>当月销冠：<strong>${escapeHtml(champion)}</strong></p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#e8f3ef;text-align:left">
            <th style="padding:8px">销售</th><th style="padding:8px">销售额</th><th style="padding:8px">回款额</th>
            <th style="padding:8px">新增客户</th><th style="padding:8px">提成</th><th style="padding:8px">预估应发</th>
          </tr>
        </thead>
        <tbody>${tableRows(team.rows, columns)}</tbody>
      </table>
      <p style="color:#999;font-size:12px">说明：预估金额按当月提成规则测算，最终以财务结算为准。</p>
    </div>`;
  return { subject, text, html };
}

async function fetchContacts(config) {
  const data = await internalFetch(`${config.internal.services.identity}/internal/users/contacts`, {
    service: 'hrms',
    secret: config.internal.secret,
    body: {},
  });
  return (data.users || []).map((user) => ({
    id: Number(user.id),
    name: user.name,
    email: user.email || null,
    role: user.role,
    status: user.status,
  }));
}

async function alreadySent(db, period, type, recipient) {
  const [rows] = await db.query(
    "SELECT id FROM hrms_report_logs WHERE period = ? AND report_type = ? AND recipient = ? AND status = 'sent' LIMIT 1",
    [period, type, recipient]
  );
  return rows.length > 0;
}

async function deliver(app, { period, type, recipient, message }) {
  const db = app.db;
  if (await alreadySent(db, period, type, recipient)) return { status: 'skipped' };
  const [inserted] = await db.query(
    'INSERT INTO hrms_report_logs (period, report_type, recipient, status) VALUES (?,?,?,?)',
    [period, type, recipient, 'pending']
  );
  try {
    await sendMail(app.config.mail, { ...message, to: recipient });
    await db.query('UPDATE hrms_report_logs SET status = ? WHERE id = ?', ['sent', inserted.insertId]);
    return { status: 'sent' };
  } catch (error) {
    await db.query('UPDATE hrms_report_logs SET status = ?, error = ? WHERE id = ?', [
      'failed', String(error.message || error).slice(0, 500), inserted.insertId,
    ]);
    return { status: 'failed', error: String(error.message || error) };
  }
}

async function sendReports(app, { period, type = 'all' }) {
  assertPeriod(period);
  const users = await fetchContacts(app.config);
  const performance = await buildPerformance(app.db, period, users);
  const summary = { period, type, sent: 0, skipped: 0, failed: 0, errors: [] };

  if (type === 'personal' || type === 'all') {
    for (const row of performance.rows) {
      if (!row.email) {
        summary.skipped += 1;
        continue;
      }
      const result = await deliver(app, {
        period,
        type: 'personal',
        recipient: row.email,
        message: renderPersonal(row, period),
      });
      summary[result.status] += 1;
      if (result.error) summary.errors.push({ email: row.email, error: result.error });
    }
  }

  if (type === 'team' || type === 'all') {
    const [recipients] = await app.db.query('SELECT email FROM hrms_report_recipients ORDER BY id');
    if (!recipients.length) {
      summary.errors.push({ error: 'no_team_recipients' });
    }
    for (const recipient of recipients) {
      const result = await deliver(app, {
        period,
        type: 'team',
        recipient: recipient.email,
        message: renderTeam(performance.team, period),
      });
      summary[result.status] += 1;
      if (result.error) summary.errors.push({ email: recipient.email, error: result.error });
    }
  }

  return summary;
}

module.exports = { sendReports, fetchContacts, renderPersonal, renderTeam };
