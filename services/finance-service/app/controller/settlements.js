'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');
const { num, salesScopeFor, scopeClause } = require('../../lib/finance');
const { resolveRule, rateForAmount, periodOfDate } = require('../../lib/commission-rules');

function toSettlement(row) {
  return {
    ...row,
    id: Number(row.id),
    user_id: Number(row.user_id),
    base_salary: num(row.base_salary),
    deposit_commission_total: num(row.deposit_commission_total),
    settlement_commission_total: num(row.settlement_commission_total),
    commission_total: num(row.commission_total),
    adjustment_total: num(row.adjustment_total),
    first_order_reward: num(row.first_order_reward),
    referral_reward: num(row.referral_reward),
    diligence_reward: num(row.diligence_reward),
    champion_reward: num(row.champion_reward),
    deduction_total: num(row.deduction_total),
    survey_count: Number(row.survey_count || 0),
    payable: num(row.payable),
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function assertUserScope(ctx, userId) {
  const scope = salesScopeFor(ctx.state.user);
  if (scope !== null && !scope.includes(Number(userId))) ctx.throw(403, 'forbidden');
}

async function loadSettlement(ctx, id) {
  const [rows] = await ctx.app.db.query('SELECT * FROM settlements WHERE id = ?', [id]);
  if (!rows.length) ctx.throw(404, 'settlement_not_found');
  assertUserScope(ctx, rows[0].user_id);
  return rows[0];
}

module.exports = {
  async list(ctx) {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    const params = [];
    let where = ' WHERE 1 = 1';
    where += scopeClause('user_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.period) { where += ' AND period = ?'; params.push(String(ctx.query.period)); }
    if (ctx.query.status) { where += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (q) {
      where += ' AND (user_name LIKE ? OR period LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    const [[counted]] = await ctx.app.db.query(
      `SELECT COUNT(*) AS total FROM settlements${where}`, params
    );
    const [rows] = await ctx.app.db.query(
      `SELECT * FROM settlements${where} ORDER BY period DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    ctx.body = { settlements: rows.map(toSettlement), total: Number(counted.total), page, page_size: pageSize };
  },

  async detail(ctx) {
    const settlement = await loadSettlement(ctx, Number(ctx.params.id));
    const [items] = await ctx.app.db.query('SELECT * FROM settlement_items WHERE settlement_id = ? ORDER BY id', [settlement.id]);
    const [payouts] = await ctx.app.db.query('SELECT * FROM payouts WHERE settlement_id = ? ORDER BY id', [settlement.id]);
    ctx.body = {
      settlement: toSettlement(settlement),
      items: items.map((row) => ({ ...row, id: Number(row.id), settlement_id: Number(row.settlement_id), order_id: row.order_id ? Number(row.order_id) : null, amount: num(row.amount) })),
      payouts: payouts.map((row) => ({ ...row, id: Number(row.id), settlement_id: Number(row.settlement_id), user_id: Number(row.user_id), amount: num(row.amount) })),
    };
  },

  async generate(ctx) {
    const body = ctx.request.body || {};
    const period = String(body.period || '');
    if (!/^\d{4}-\d{2}$/.test(period)) ctx.throw(400, 'invalid_period');
    // 当月规则版本：底薪、奖励、勤奋奖门槛、销冠奖等关键参数均按月取值
    const periodRule = await resolveRule(ctx.app.db, period);
    const baseSalary = body.base_salary === undefined || body.base_salary === null || body.base_salary === ''
      ? num(periodRule.base_salary) : Number(body.base_salary);
    const [candidates] = await ctx.app.db.query(
      `SELECT l.salesperson_id AS user_id, MAX(l.salesperson_name) AS name
       FROM order_ledger l
       WHERE l.status = 'accepted' AND l.outstanding <= 0 AND l.settled_at IS NULL AND l.salesperson_id IS NOT NULL
         AND DATE_FORMAT(l.accepted_at, '%Y-%m') = ?
       GROUP BY l.salesperson_id`, [period]
    );
    const [adjustUsers] = await ctx.app.db.query(
      `SELECT DISTINCT salesperson_id AS user_id FROM commission_adjustments WHERE DATE_FORMAT(created_at, '%Y-%m') = ?`,
      [period]
    );
    const users = new Map();
    for (const row of candidates) users.set(Number(row.user_id), row.name);
    for (const row of adjustUsers) if (!users.has(Number(row.user_id))) users.set(Number(row.user_id), null);

    // 销冠：按当月规则指定的口径，在当期待结算销售人员中取第一名
    const [championRows] = await ctx.app.db.query(
      `SELECT salesperson_id,
              COALESCE(SUM(order_amount), 0) AS amount,
              COALESCE(SUM(received_amount), 0) AS received,
              COALESCE(SUM(commission_amount), 0) AS commission
       FROM order_ledger
       WHERE status = 'accepted' AND outstanding <= 0 AND settled_at IS NULL AND salesperson_id IS NOT NULL
         AND DATE_FORMAT(accepted_at, '%Y-%m') = ?
       GROUP BY salesperson_id`, [period]
    );
    const championMetric = { received: 'received', amount: 'amount', commission: 'commission' }[
      periodRule.champion_basis
    ] || 'received';
    let championUserId = null;
    let championValue = 0;
    for (const row of championRows) {
      const value = num(row[championMetric]);
      if (value > championValue) {
        championValue = value;
        championUserId = Number(row.salesperson_id);
      }
    }

    for (const [userId, name] of users) {
      await withTransaction(ctx.app.db, async (connection) => {
        const [ledger] = await connection.query(
          `SELECT * FROM order_ledger
           WHERE salesperson_id = ? AND status = 'accepted' AND outstanding <= 0 AND settled_at IS NULL
             AND DATE_FORMAT(accepted_at, '%Y-%m') = ? FOR UPDATE`,
          [userId, period]
        );
        const [adjustments] = await connection.query(
          `SELECT * FROM commission_adjustments
           WHERE salesperson_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?`,
          [userId, period]
        );
        if (!ledger.length && !adjustments.length) return;
        // 逐单按成交月份对应的规则版本重算提成，保证规则调整后当月结算口径一致
        const ruleCache = new Map();
        let depositCommissionTotal = 0;
        let settlementCommissionTotal = 0;
        for (const row of ledger) {
          const dealPeriod = periodOfDate(row.deal_date || row.created_at) || period;
          let rowRule = ruleCache.get(dealPeriod);
          if (!rowRule) {
            rowRule = await resolveRule(connection, dealPeriod);
            ruleCache.set(dealPeriod, rowRule);
          }
          const band = rateForAmount(rowRule, num(row.order_amount));
          const rate = Number(row.referral_flag) && rowRule.referral_exclusive ? 0 : band.rate;
          const commissionAmount = round2(num(row.order_amount) * rate);
          const depositCommission = round2(commissionAmount * rowRule.first_stage_ratio);
          const settlementCommission = round2(commissionAmount - depositCommission);
          await connection.query(
            `UPDATE order_ledger
             SET commission_rate = ?, commission_amount = ?, deposit_commission = ?, settlement_commission = ?,
                 order_type = COALESCE(order_type, ?)
             WHERE id = ?`,
            [rate, commissionAmount, depositCommission, settlementCommission, band.order_type, Number(row.id)]
          );
          row.commission_rate = rate;
          row.commission_amount = commissionAmount;
          row.deposit_commission = depositCommission;
          row.settlement_commission = settlementCommission;
          depositCommissionTotal = round2(depositCommissionTotal + depositCommission);
          settlementCommissionTotal = round2(settlementCommissionTotal + settlementCommission);
        }
        const commissionTotal = round2(depositCommissionTotal + settlementCommissionTotal);
        const referralBase = ledger.filter((row) => Number(row.referral_flag) === 1)
          .reduce((sum, row) => sum + num(row.received_amount), 0);
        const referralReward = round2(referralBase * num(periodRule.referral_rate));
        const [[surveyTotals]] = await connection.query(
          "SELECT COUNT(*) AS total FROM survey_records WHERE salesperson_id = ? AND is_valid = 1 AND DATE_FORMAT(survey_date, '%Y-%m') = ?",
          [userId, period]
        );
        const surveyCount = Number(surveyTotals.total || 0);
        const diligenceReward = surveyCount >= Number(periodRule.survey_threshold) ? num(periodRule.survey_reward) : 0;
        const awardTotal = round2(adjustments.filter((row) => row.type === 'award')
          .reduce((sum, row) => sum + num(row.amount), 0));
        const [[prior]] = await connection.query(
          'SELECT COUNT(*) AS total FROM settlements WHERE user_id = ? AND period < ?', [userId, period]
        );
        const autoFirstOrder = Number(prior.total) === 0 && ledger.length ? num(periodRule.first_order_reward) : 0;
        const firstOrderReward = round2(awardTotal + autoFirstOrder);
        const championReward = championUserId === userId ? num(periodRule.champion_reward) : 0;
        const deductionTotal = round2(adjustments.filter((row) => row.type !== 'award')
          .reduce((sum, row) => sum + num(row.amount), 0));
        const adjustmentTotal = round2(firstOrderReward + referralReward + diligenceReward + championReward - deductionTotal);
        const payable = round2(baseSalary + commissionTotal + adjustmentTotal);
        const [existing] = await connection.query(
          'SELECT * FROM settlements WHERE period = ? AND user_id = ? FOR UPDATE', [period, userId]
        );
        if (existing.length && existing[0].status !== 'draft') return;
        let settlementId;
        if (existing.length) {
          settlementId = Number(existing[0].id);
          await connection.query(
            'DELETE FROM settlement_items WHERE settlement_id = ?', [settlementId]
          );
          await connection.query(
            `UPDATE settlements SET user_name = ?, base_salary = ?, deposit_commission_total = ?,
               settlement_commission_total = ?, commission_total = ?, adjustment_total = ?, first_order_reward = ?,
               referral_reward = ?, diligence_reward = ?, champion_reward = ?, deduction_total = ?, survey_count = ?,
               payable = ?, created_by = ? WHERE id = ?`,
            [name || existing[0].user_name, baseSalary, depositCommissionTotal, settlementCommissionTotal,
              commissionTotal, adjustmentTotal, firstOrderReward, referralReward, diligenceReward, championReward,
              deductionTotal, surveyCount, payable, Number(ctx.state.user.id), settlementId]
          );
        } else {
          const [inserted] = await connection.query(
            `INSERT INTO settlements (period, user_id, user_name, base_salary, deposit_commission_total,
               settlement_commission_total, commission_total, adjustment_total, first_order_reward, referral_reward,
               diligence_reward, champion_reward, deduction_total, survey_count, payable, status, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [period, userId, name, baseSalary, depositCommissionTotal, settlementCommissionTotal, commissionTotal,
              adjustmentTotal, firstOrderReward, referralReward, diligenceReward, championReward, deductionTotal,
              surveyCount, payable, 'draft', Number(ctx.state.user.id)]
          );
          settlementId = Number(inserted.insertId);
        }
        for (const row of ledger) {
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, Number(row.order_id), row.order_no, 'commission', num(row.commission_amount), 'Sales commission']
          );
        }
        if (autoFirstOrder > 0) {
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, null, null, 'reward', autoFirstOrder, 'First order reward']
          );
        }
        if (referralReward > 0) {
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, null, null, 'reward', referralReward, 'Referral reward']
          );
        }
        if (diligenceReward > 0) {
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, null, null, 'reward', diligenceReward, 'Diligence reward']
          );
        }
        if (championReward > 0) {
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, null, null, 'reward', championReward, 'Champion reward']
          );
        }
        for (const row of adjustments) {
          const isAward = row.type === 'award';
          await connection.query(
            'INSERT INTO settlement_items (settlement_id, order_id, order_no, kind, amount, note) VALUES (?,?,?,?,?,?)',
            [settlementId, row.order_id ? Number(row.order_id) : null, null,
              isAward ? 'reward' : 'deduction', isAward ? num(row.amount) : -num(row.amount),
              `${row.type}: ${row.reason}`]
          );
        }
      });
    }
    const params = [period];
    const [rows] = await ctx.app.db.query('SELECT * FROM settlements WHERE period = ? ORDER BY id', params);
    ctx.body = { settlements: rows.map(toSettlement) };
  },

  async confirm(ctx) {
    const id = Number(ctx.params.id);
    await loadSettlement(ctx, id);
    const [result] = await ctx.app.db.query(
      "UPDATE settlements SET status = 'confirmed' WHERE id = ? AND status = 'draft'", [id]
    );
    if (!result.affectedRows) ctx.throw(409, 'settlement_not_draft');
    ctx.body = { id, status: 'confirmed' };
  },

  async pay(ctx) {
    const id = Number(ctx.params.id);
    const settlement = await loadSettlement(ctx, id);
    if (settlement.status !== 'confirmed') ctx.throw(409, 'settlement_not_confirmed');
    const body = ctx.request.body || {};
    const type = ['actual', 'pending', 'recovered'].includes(body.type) ? body.type : 'actual';
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        "UPDATE settlements SET status = 'paid' WHERE id = ?", [id]
      );
      await connection.query(
        `INSERT INTO payouts (settlement_id, user_id, amount, type, note, created_by) VALUES (?,?,?,?,?,?)`,
        [id, Number(settlement.user_id), num(settlement.payable), type, body.note || null, Number(ctx.state.user.id)]
      );
      const [items] = await connection.query(
        "SELECT DISTINCT order_id FROM settlement_items WHERE settlement_id = ? AND order_id IS NOT NULL", [id]
      );
      if (items.length) {
        const ids = items.map((row) => Number(row.order_id));
        await connection.query(
          `UPDATE order_ledger SET settled_at = NOW(), paid_commission = paid_commission + commission_amount
           WHERE order_id IN (${ids.map(() => '?').join(',')})`, ids
        );
      }
      await enqueueEvent(connection, {
        type: EVENTS.PAYOUT_CHANGED,
        aggregateId: id,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: {
          settlement_id: id,
          user_id: Number(settlement.user_id),
          amount: num(settlement.payable),
          type,
          period: settlement.period,
        },
      });
    });
    ctx.body = { id, status: 'paid' };
  },
};
