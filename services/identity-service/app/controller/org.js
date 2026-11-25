'use strict';

const { withTransaction } = require('@solar/service-kit');

const POSITION_SQL = `SELECT p.*, d.code AS department_code, d.name AS department_name
                      FROM org_positions p
                      JOIN org_departments d ON d.id = p.department_id`;

async function loadPosition(db, id) {
  const [rows] = await db.query(`${POSITION_SQL} WHERE p.id = ? AND p.active = 1`, [Number(id)]);
  return rows[0] || null;
}

// 上级职位在岗人员，用于自动确定所属负责人
async function parentHolderId(db, position) {
  if (!position || !position.parent_id) return null;
  const [rows] = await db.query(
    "SELECT id FROM users WHERE position_id = ? AND status = 'active' ORDER BY id LIMIT 1",
    [Number(position.parent_id)]
  );
  return rows.length ? Number(rows[0].id) : null;
}

function toHolder(row) {
  return { id: Number(row.id), user_no: row.user_no, name: row.name, role: row.role };
}

module.exports = {
  // 组织架构树：部门 -> 职位 -> 在岗人员（可为空，即职位空缺）
  async structure(ctx) {
    const [departments] = await ctx.app.db.query(
      'SELECT id, code, name, sort_order FROM org_departments ORDER BY sort_order, id'
    );
    const [positions] = await ctx.app.db.query(
      `${POSITION_SQL} WHERE p.active = 1 ORDER BY p.level, p.sort_order, p.id`
    );
    const [holders] = await ctx.app.db.query(
      `SELECT u.id, u.user_no, u.name, u.role, u.position_id
       FROM users u WHERE u.position_id IS NOT NULL AND u.status = 'active' ORDER BY u.name`
    );
    const byPosition = new Map();
    for (const row of holders) {
      const key = Number(row.position_id);
      if (!byPosition.has(key)) byPosition.set(key, []);
      byPosition.get(key).push(toHolder(row));
    }
    ctx.body = {
      departments: departments.map((department) => ({
        id: Number(department.id),
        code: department.code,
        name: department.name,
        sort_order: Number(department.sort_order),
        positions: positions
          .filter((position) => Number(position.department_id) === Number(department.id))
          .map((position) => {
            const list = byPosition.get(Number(position.id)) || [];
            return {
              id: Number(position.id),
              name: position.name,
              level: Number(position.level),
              role_key: position.role_key,
              parent_id: position.parent_id ? Number(position.parent_id) : null,
              single_holder: Boolean(position.single_holder),
              holders: list,
              vacant: list.length === 0,
            };
          }),
      })),
    };
  },

  // 概览范围：公司 / 部门 / 个人，并返回组织规模数据
  async overview(ctx) {
    const user = ctx.state.user;
    const [rows] = await ctx.app.db.query(
      `SELECT u.id, u.role, u.position_id,
              p.name AS position_name, p.level AS position_level, p.role_key AS position_role,
              d.code AS department_code, d.name AS department_name
       FROM users u
       LEFT JOIN org_positions p ON p.id = u.position_id
       LEFT JOIN org_departments d ON d.id = p.department_id
       WHERE u.id = ?`,
      [Number(user.id)]
    );
    const me = rows[0] || {};
    let scope = 'self';
    if (me.role === 'super_admin' || Number(me.position_level) === 1) scope = 'company';
    else if (Number(me.position_level) === 2) scope = 'department';

    const [[headcount]] = await ctx.app.db.query(
      "SELECT COUNT(*) AS total FROM users WHERE status = 'active' AND role <> 'member'"
    );
    const [departments] = await ctx.app.db.query(
      `SELECT d.id, d.code, d.name,
              (SELECT COUNT(*) FROM org_positions p WHERE p.department_id = d.id AND p.active = 1) AS positions,
              (SELECT COUNT(*) FROM users u WHERE u.status = 'active'
                 AND u.position_id IN (SELECT p2.id FROM org_positions p2 WHERE p2.department_id = d.id)) AS headcount
       FROM org_departments d ORDER BY d.sort_order, d.id`
    );
    const [vacancies] = await ctx.app.db.query(
      `SELECT p.department_id, COUNT(*) AS vacant
       FROM org_positions p
       LEFT JOIN users u ON u.position_id = p.id AND u.status = 'active'
       WHERE p.active = 1
       GROUP BY p.department_id
       HAVING COUNT(u.id) = 0`
    );
    const vacancyByDept = new Map(vacancies.map((row) => [Number(row.department_id), Number(row.vacant)]));
    const [[positionCount]] = await ctx.app.db.query(
      'SELECT COUNT(*) AS total FROM org_positions WHERE active = 1'
    );

    ctx.body = {
      scope,
      position: me.position_id
        ? { id: Number(me.position_id), name: me.position_name, level: Number(me.position_level) }
        : null,
      department: scope === 'department' && me.department_code
        ? { code: me.department_code, name: me.department_name }
        : null,
      totals: {
        headcount: Number(headcount.total || 0),
        positions: Number(positionCount.total || 0),
        vacancies: vacancies.reduce((sum, row) => sum + Number(row.vacant), 0),
        departments: departments.length,
      },
      departments: departments.map((department) => ({
        id: Number(department.id),
        code: department.code,
        name: department.name,
        headcount: Number(department.headcount || 0),
        positions: Number(department.positions || 0),
        vacancies: vacancyByDept.get(Number(department.id)) || 0,
      })),
    };
  },

  // 指派人员到职位；管理岗唯一，员工岗可多人
  async assign(ctx) {
    const positionId = Number(ctx.params.id);
    const userId = Number((ctx.request.body || {}).user_id);
    if (!userId) ctx.throw(400, 'user_required');
    const position = await loadPosition(ctx.app.db, positionId);
    if (!position) ctx.throw(404, 'position_not_found');
    const [users] = await ctx.app.db.query('SELECT id, name, role, status FROM users WHERE id = ?', [userId]);
    if (!users.length) ctx.throw(404, 'user_not_found');
    const target = users[0];
    if (target.status !== 'active') ctx.throw(400, 'user_inactive');
    if (position.role_key && position.role_key !== target.role) ctx.throw(400, 'position_role_mismatch');
    if (position.single_holder) {
      const [occupied] = await ctx.app.db.query(
        "SELECT id, name FROM users WHERE position_id = ? AND id <> ? AND status = 'active' LIMIT 1",
        [positionId, userId]
      );
      if (occupied.length) ctx.throw(409, 'position_occupied');
    }
    const managerId = await parentHolderId(ctx.app.db, position);

    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        'UPDATE users SET position_id = ?, manager_id = ? WHERE id = ?', [positionId, managerId, userId]
      );
      // 部门经理到岗后，同步下属员工的所属负责人
      if (Number(position.level) === 2) {
        await connection.query(
          `UPDATE users SET manager_id = ?
           WHERE status = 'active'
             AND position_id IN (SELECT id FROM org_positions WHERE parent_id = ?)`,
          [userId, positionId]
        );
      }
    });
    ctx.body = { position_id: positionId, user_id: userId, manager_id: managerId };
  },

  // 职位设为空缺：清空在岗人员，并解除下属的负责人引用
  async vacate(ctx) {
    const positionId = Number(ctx.params.id);
    const position = await loadPosition(ctx.app.db, positionId);
    if (!position) ctx.throw(404, 'position_not_found');
    await withTransaction(ctx.app.db, async (connection) => {
      if (Number(position.level) === 2) {
        await connection.query(
          `UPDATE users SET manager_id = NULL
           WHERE position_id IN (SELECT id FROM org_positions WHERE parent_id = ?)`,
          [positionId]
        );
      }
      await connection.query('UPDATE users SET position_id = NULL WHERE position_id = ?', [positionId]);
    });
    ctx.body = { position_id: positionId, vacant: true };
  },
};
