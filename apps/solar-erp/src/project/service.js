'use strict';

const { withTransaction } = require('../common/db');
const { nextCode, dayPeriod, monthPeriod } = require('../common/codes');
const { record } = require('../common/audit');
const {
  badRequest, notFound, fail, str, money, pageParams, paged, today,
} = require('../common/http');
const {
  storeFilter, projectFilter, assertProject, isAdmin, isEngineer, isCaptain,
} = require('../common/scope');

/** 项目工单状态机（顺序即主链路） */
const STATUS = {
  CREATED: 'created',                 // 待勘测
  SURVEYING: 'surveying',             // 勘测中
  SURVEYED: 'surveyed',               // 已勘测
  QUOTED: 'quoted',                   // 已报价
  CONTRACTED: 'contracted',           // 已签约
  MATERIAL_ISSUED: 'material_issued', // 已领料
  CONSTRUCTING: 'constructing',       // 施工中
  CONSTRUCTED: 'constructed',         // 施工完成
  ACCEPTED: 'accepted',               // 已验收（待并网）
  GRID_CONNECTED: 'grid_connected',   // 已并网
  SETTLED: 'settled',                 // 已结清
  CLOSED: 'closed',                   // 已闭环
};

function assertStatus(project, allowed) {
  if (!allowed.includes(project.status)) {
    fail('invalid_project_status', 409, { current: project.status, allowed });
  }
}

// ---------------------------------------------------------------------------
// 客户（project 域）
// ---------------------------------------------------------------------------
async function listCustomers(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'c.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.keyword) {
    where.push('(c.code LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM customers c ${clause}`, params);
  const [items] = await db.query(
    `SELECT c.*, s.name AS store_name FROM customers c
     LEFT JOIN stores s ON s.id = c.store_id
     ${clause} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function createCustomer(conn, payload, actor) {
  const name = str(payload.name, { required: true, max: 120, field: 'name' });
  const storeId = payload.store_id ? Number(payload.store_id) : actor.store_id;
  if (!storeId) badRequest('store_required');
  const code = await nextCode(conn, 'customer', 'CUS', { width: 4 });
  const [inserted] = await conn.query(
    `INSERT INTO customers (code, store_id, name, phone, email, address, source, owner_user_id, remark)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [code, storeId, name, str(payload.phone, { max: 40 }), str(payload.email, { max: 120 }),
      str(payload.address, { max: 255 }), str(payload.source, { max: 40 }) || 'store',
      actor.id || null, str(payload.remark, { max: 500 })]
  );
  const [rows] = await conn.query('SELECT * FROM customers WHERE id = ?', [inserted.insertId]);
  await record(conn, {
    module: 'project', entity: 'customer', entityId: inserted.insertId,
    action: 'create', actor, after: rows[0],
  });
  return rows[0];
}

async function updateCustomer(db, id, payload, user) {
  const [rows] = await db.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('customer_not_found');
  if (storeFilter(user, 'store_id').sql) {
    const filter = storeFilter(user, 'store_id');
    if (Number(rows[0].store_id) !== Number(filter.params[0])) fail('store_forbidden', 403);
  }
  const allow = ['name', 'phone', 'email', 'address', 'remark'];
  const sets = [];
  const params = [];
  for (const field of allow) {
    if (payload[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(str(payload[field], { max: field === 'address' ? 255 : 120, field }));
    }
  }
  if (!sets.length) badRequest('nothing_to_update');
  params.push(id);
  await db.query(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, params);
  const [afterRows] = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
  await withTransaction(db, (conn) => record(conn, {
    module: 'project', entity: 'customer', entityId: id,
    action: 'update', actor: { id: user.id, name: user.name }, before: rows[0], after: afterRows[0],
  }));
  return afterRows[0];
}

// ---------------------------------------------------------------------------
// 项目工单
// ---------------------------------------------------------------------------
async function listProjects(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = projectFilter(user, 'p');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.status) { where.push('p.status = ?'); params.push(query.status); }
  if (query.store_id && isAdmin(user)) { where.push('p.store_id = ?'); params.push(Number(query.store_id)); }
  if (query.keyword) {
    where.push('(p.project_no LIKE ? OR p.customer_name LIKE ? OR p.customer_phone LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM projects p ${clause}`, params);
  const [items] = await db.query(
    `SELECT p.*, s.code AS store_code, s.name AS store_name
     FROM projects p LEFT JOIN stores s ON s.id = p.store_id
     ${clause} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function getProjectRaw(db, id) {
  const [rows] = await db.query(
    `SELECT p.*, s.code AS store_code, s.name AS store_name
     FROM projects p LEFT JOIN stores s ON s.id = p.store_id WHERE p.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) notFound('project_not_found');
  return rows[0];
}

async function getProject(db, id, user) {
  const project = await getProjectRaw(db, id);
  assertProject(user, project);
  return project;
}

/** 按项目编号查项目（供 Agent 等内部调用，不绕过数据权限）。 */
async function getProjectByNo(db, projectNo) {
  const [rows] = await db.query('SELECT * FROM projects WHERE project_no = ? LIMIT 1', [projectNo]);
  return rows[0] || null;
}

async function getProjectBundle(db, id, user) {
  const project = await getProject(db, id, user);
  const [customers] = project.customer_id
    ? await db.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [project.customer_id])
    : [[]];
  const [surveys] = await db.query('SELECT * FROM surveys WHERE project_id = ? LIMIT 1', [id]);
  const [quotes] = await db.query('SELECT * FROM quotes WHERE project_id = ? ORDER BY version DESC, id DESC', [id]);
  const [contracts] = await db.query('SELECT * FROM contracts WHERE project_id = ? LIMIT 1', [id]);
  const [plans] = await db.query('SELECT * FROM payment_plans WHERE project_id = ? ORDER BY seq', [id]);
  const [constructions] = await db.query('SELECT * FROM constructions WHERE project_id = ? LIMIT 1', [id]);
  const [logs] = await db.query('SELECT * FROM construction_logs WHERE project_id = ? ORDER BY id DESC', [id]);
  const [acceptances] = await db.query('SELECT * FROM acceptances WHERE project_id = ? LIMIT 1', [id]);
  const [warranties] = await db.query('SELECT * FROM warranties WHERE project_id = ? LIMIT 1', [id]);
  return {
    project,
    customer: customers[0] || null,
    survey: surveys[0] || null,
    quotes,
    contract: contracts[0] || null,
    payment_plans: plans,
    construction: constructions[0] || null,
    construction_logs: logs,
    acceptance: acceptances[0] || null,
    warranty: warranties[0] || null,
  };
}

/**
 * 销售单转项目工单：由 sales 域在同一个事务内调用。
 */
async function createFromOrder(conn, data) {
  const projectNo = await nextCode(conn, 'project', 'PJ', { period: monthPeriod(), separator: '-', width: 4 });
  const capacity = money(data.capacity_kw, 0);
  const [inserted] = await conn.query(
    `INSERT INTO projects
     (project_no, sales_order_id, store_id, customer_id, customer_name, customer_phone, customer_address,
      capacity_kw, system_type, status, sales_user_id, sales_user_name, created_by, remark)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [projectNo, data.sales_order_id || null, data.store_id, data.customer_id || null,
      data.customer_name, data.customer_phone || null, data.customer_address || null,
      capacity, data.system_type || 'roof', STATUS.CREATED, data.sales_user_id || null,
      data.sales_user_name || null, data.created_by || null, data.remark || null]
  );
  await record(conn, {
    module: 'project', entity: 'project', entityId: inserted.insertId, action: 'create',
    actor: data.actor || {},
    after: { project_no: projectNo, status: STATUS.CREATED, customer_name: data.customer_name },
    remark: `由销售单 ${data.order_no || ''} 生成`,
  });
  return { id: inserted.insertId, project_no: projectNo, status: STATUS.CREATED };
}

// ---------------------------------------------------------------------------
// 勘测
// ---------------------------------------------------------------------------
async function saveSurvey(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.CREATED, STATUS.SURVEYING]);

  let engineerId = null;
  let engineerUserId = project.surveyor_id;
  let engineerName = project.surveyor_name;
  if (payload.engineer_id) {
    const [rows] = await db.query('SELECT * FROM engineers WHERE id = ? AND status = ? LIMIT 1', [payload.engineer_id, 'active']);
    if (!rows.length) badRequest('engineer_not_found');
    if (!rows[0].user_id) badRequest('engineer_account_required');
    engineerId = rows[0].id;
    engineerUserId = rows[0].user_id;
    engineerName = rows[0].name;
  } else if (isEngineer(user)) {
    engineerUserId = user.id;
    engineerName = user.name;
  }
  if (!engineerUserId) badRequest('engineer_required');

  return withTransaction(db, async (conn) => {
    const [existing] = await conn.query('SELECT * FROM surveys WHERE project_id = ? LIMIT 1', [projectId]);
    const photoIds = JSON.stringify(Array.isArray(payload.photo_ids) ? payload.photo_ids : []);
    let survey;
    if (existing.length) {
      await conn.query(
        `UPDATE surveys SET engineer_id = ?, engineer_name = ?, survey_date = ?, roof_type = ?, roof_area = ?,
         roof_condition = ?, grid_phase = ?, meter_no = ?, remarks = ?, photo_ids = ?
         WHERE id = ?`,
        [engineerId, engineerName, str(payload.survey_date, { max: 20 }), str(payload.roof_type, { max: 40 }),
          money(payload.roof_area, 0), str(payload.roof_condition, { max: 255 }), str(payload.grid_phase, { max: 20 }),
          str(payload.meter_no, { max: 80 }), str(payload.remarks, { max: 1000 }), photoIds, existing[0].id]
      );
      survey = { id: existing[0].id };
      await record(conn, {
        module: 'project', entity: 'survey', entityId: existing[0].id, action: 'update',
        actor: { id: user.id, name: user.name }, before: existing[0], after: { ...existing[0], ...payload, photo_ids: photoIds },
      });
    } else {
      const surveyNo = await nextCode(conn, 'survey', 'SV', { period: dayPeriod(), separator: '-', width: 4 });
      const [inserted] = await conn.query(
        `INSERT INTO surveys
         (project_id, survey_no, engineer_id, engineer_name, survey_date, roof_type, roof_area, roof_condition,
          grid_phase, meter_no, remarks, photo_ids, status, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [projectId, surveyNo, engineerId, engineerName, str(payload.survey_date, { max: 20 }) || today(),
          str(payload.roof_type, { max: 40 }), money(payload.roof_area, 0), str(payload.roof_condition, { max: 255 }),
          str(payload.grid_phase, { max: 20 }), str(payload.meter_no, { max: 80 }),
          str(payload.remarks, { max: 1000 }), photoIds, 'draft', user.id]
      );
      survey = { id: inserted.insertId, survey_no: surveyNo };
      await record(conn, {
        module: 'project', entity: 'survey', entityId: inserted.insertId, action: 'create',
        actor: { id: user.id, name: user.name }, after: { project_id: projectId, survey_no: surveyNo },
      });
    }
    await conn.query(
      'UPDATE projects SET surveyor_id = ?, surveyor_name = ?, status = ? WHERE id = ?',
      [engineerUserId, engineerName, STATUS.SURVEYING, projectId]
    );
    return survey;
  });
}

async function submitSurvey(db, projectId, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.SURVEYING]);
  if (isEngineer(user) && Number(project.surveyor_id) !== Number(user.id)) fail('surveyor_forbidden', 403);
  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM surveys WHERE project_id = ? LIMIT 1', [projectId]);
    if (!rows.length) badRequest('survey_required');
    await conn.query("UPDATE surveys SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [rows[0].id]);
    await conn.query('UPDATE projects SET status = ? WHERE id = ?', [STATUS.SURVEYED, projectId]);
    await record(conn, {
      module: 'project', entity: 'survey', entityId: rows[0].id, action: 'submit',
      actor: { id: user.id, name: user.name }, after: { status: 'submitted' },
    });
    return { project_status: STATUS.SURVEYED };
  });
}

// ---------------------------------------------------------------------------
// 报价
// ---------------------------------------------------------------------------
async function createQuote(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.SURVEYED, STATUS.QUOTED]);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) badRequest('quote_items_required');
  const normalized = items.map((item, index) => {
    const name = str(item.name, { required: true, max: 160, field: `items[${index}].name` });
    const qty = money(item.qty, 0);
    if (qty <= 0) badRequest('invalid_quantity');
    const unitPrice = money(item.unit_price, 0);
    return {
      name,
      spec: str(item.spec, { max: 255 }),
      unit: str(item.unit, { max: 20 }) || 'pcs',
      qty,
      unit_price: unitPrice,
      amount: Math.round(qty * unitPrice * 100) / 100,
    };
  });
  const total = normalized.reduce((sum, item) => sum + item.amount, 0);
  const discount = money(payload.discount_amount, 0);
  const finalAmount = Math.max(0, Math.round((total - discount) * 100) / 100);

  return withTransaction(db, async (conn) => {
    const [[{ version }]] = await conn.query('SELECT COALESCE(MAX(version), 0) AS version FROM quotes WHERE project_id = ?', [projectId]);
    const quoteNo = await nextCode(conn, 'quote', 'QT', { period: monthPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO quotes (project_id, quote_no, version, items, total_amount, discount_amount, final_amount, status, remark, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [projectId, quoteNo, Number(version) + 1, JSON.stringify(normalized), total, discount, finalAmount,
        'pending', str(payload.remark, { max: 500 }), user.id]
    );
    await conn.query('UPDATE projects SET status = ? WHERE id = ?', [STATUS.QUOTED, projectId]);
    await record(conn, {
      module: 'project', entity: 'quote', entityId: inserted.insertId, action: 'create',
      actor: { id: user.id, name: user.name }, after: { quote_no: quoteNo, final_amount: finalAmount },
    });
    return { id: inserted.insertId, quote_no: quoteNo, final_amount: finalAmount, project_status: STATUS.QUOTED };
  });
}

async function approveQuote(db, projectId, quoteId, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.QUOTED]);
  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM quotes WHERE id = ? AND project_id = ? LIMIT 1', [quoteId, projectId]);
    if (!rows.length) notFound('quote_not_found');
    if (rows[0].status !== 'pending') fail('quote_not_pending', 409);
    await conn.query("UPDATE quotes SET status = 'rejected' WHERE project_id = ? AND status = 'pending'", [projectId]);
    await conn.query("UPDATE quotes SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [user.id, quoteId]);
    await record(conn, {
      module: 'project', entity: 'quote', entityId: quoteId, action: 'approve',
      actor: { id: user.id, name: user.name }, before: { status: 'pending' }, after: { status: 'approved' },
    });
    return { id: Number(quoteId), status: 'approved' };
  });
}

// ---------------------------------------------------------------------------
// 合同 + 收款计划
// ---------------------------------------------------------------------------
async function signContract(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.QUOTED]);
  const [approved] = await db.query(
    "SELECT * FROM quotes WHERE project_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1", [projectId]
  );
  const amount = money(payload.amount, approved.length ? Number(approved[0].final_amount) : 0);
  if (amount <= 0) badRequest('contract_amount_required');
  const depositRatio = money(payload.deposit_ratio, 30);
  if (depositRatio <= 0 || depositRatio >= 100) badRequest('invalid_deposit_ratio');

  return withTransaction(db, async (conn) => {
    const [existing] = await conn.query('SELECT id FROM contracts WHERE project_id = ? LIMIT 1', [projectId]);
    if (existing.length) fail('contract_exists', 409);
    const contractNo = await nextCode(conn, 'contract', 'CT', { period: monthPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO contracts (project_id, contract_no, amount, deposit_ratio, signed_at, file_id, status, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [projectId, contractNo, amount, depositRatio, str(payload.signed_at, { max: 20 }) || today(),
        payload.file_id || null, 'signed', user.id]
    );
    const ratios = [
      { name: '定金', ratio: depositRatio },
      { name: '进度款', ratio: Math.round((100 - depositRatio) * 0.7 * 100) / 100 },
      { name: '尾款', ratio: Math.round((100 - depositRatio) * 0.3 * 100) / 100 },
    ];
    const planRows = [];
    for (let index = 0; index < ratios.length; index += 1) {
      const planAmount = Math.round(amount * ratios[index].ratio) / 100;
      const [plan] = await conn.query(
        `INSERT INTO payment_plans (project_id, contract_id, seq, name, ratio, amount, due_date, status)
         VALUES (?,?,?,?,?,?,DATE_ADD(CURDATE(), INTERVAL ? DAY),'pending')`,
        [projectId, inserted.insertId, index + 1, ratios[index].name, ratios[index].ratio, planAmount, (index + 1) * 15]
      );
      planRows.push({ id: plan.insertId, name: ratios[index].name, ratio: ratios[index].ratio, amount: planAmount });
    }
    await conn.query('UPDATE projects SET contract_amount = ?, status = ? WHERE id = ?', [amount, STATUS.CONTRACTED, projectId]);
    await record(conn, {
      module: 'project', entity: 'contract', entityId: inserted.insertId, action: 'sign',
      actor: { id: user.id, name: user.name }, after: { contract_no: contractNo, amount, deposit_ratio: depositRatio },
    });
    return { id: inserted.insertId, contract_no: contractNo, amount, plans: planRows, project_status: STATUS.CONTRACTED };
  });
}

// ---------------------------------------------------------------------------
// 施工
// ---------------------------------------------------------------------------
async function startConstruction(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.CONTRACTED, STATUS.MATERIAL_ISSUED]);

  let captainId = payload.captain_user_id ? Number(payload.captain_user_id) : null;
  let captainName = null;
  const crewId = payload.crew_id ? Number(payload.crew_id) : null;
  if (crewId) {
    const [crews] = await db.query('SELECT * FROM crews WHERE id = ? LIMIT 1', [crewId]);
    if (!crews.length) badRequest('crew_not_found');
    if (!captainId) captainId = crews[0].captain_user_id;
    captainName = crews[0].leader_name;
  }
  if (captainId) {
    const [users] = await db.query("SELECT * FROM users WHERE id = ? AND role = 'construction_captain' LIMIT 1", [captainId]);
    if (!users.length) badRequest('captain_not_found');
    captainName = users[0].name;
  } else {
    badRequest('captain_required');
  }

  return withTransaction(db, async (conn) => {
    const [existing] = await conn.query('SELECT id FROM constructions WHERE project_id = ? LIMIT 1', [projectId]);
    if (existing.length) {
      await conn.query(
        `UPDATE constructions SET captain_user_id = ?, captain_name = ?, crew_id = ?, start_date = ?, status = 'in_progress'
         WHERE project_id = ?`,
        [captainId, captainName, crewId, str(payload.start_date, { max: 20 }) || today(), projectId]
      );
    } else {
      await conn.query(
        `INSERT INTO constructions (project_id, captain_user_id, captain_name, crew_id, start_date, progress, status)
         VALUES (?,?,?,?,?,0,'in_progress')`,
        [projectId, captainId, captainName, crewId, str(payload.start_date, { max: 20 }) || today()]
      );
    }
    await conn.query(
      'UPDATE projects SET captain_user_id = ?, captain_name = ?, crew_id = ?, status = ? WHERE id = ?',
      [captainId, captainName, crewId, STATUS.CONSTRUCTING, projectId]
    );
    await record(conn, {
      module: 'project', entity: 'construction', entityId: projectId, action: 'assign',
      actor: { id: user.id, name: user.name }, after: { captain_user_id: captainId, captain_name: captainName },
    });
    return { captain_user_id: captainId, captain_name: captainName, project_status: STATUS.CONSTRUCTING };
  });
}

async function addConstructionLog(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.CONSTRUCTING]);
  if (isCaptain(user) && Number(project.captain_user_id) !== Number(user.id)) fail('captain_forbidden', 403);
  const content = str(payload.content, { required: true, max: 1000, field: 'content' });
  const progress = Math.min(100, Math.max(0, Number(payload.progress) || 0));

  return withTransaction(db, async (conn) => {
    const [inserted] = await conn.query(
      `INSERT INTO construction_logs (project_id, log_date, content, progress, photo_ids, created_by, created_by_name)
       VALUES (?,?,?,?,?,?,?)`,
      [projectId, str(payload.log_date, { max: 20 }) || today(), content, progress,
        JSON.stringify(Array.isArray(payload.photo_ids) ? payload.photo_ids : []), user.id, user.name]
    );
    await conn.query(
      "UPDATE constructions SET progress = GREATEST(progress, ?), status = 'in_progress' WHERE project_id = ?",
      [progress, projectId]
    );
    return { id: inserted.insertId, progress };
  });
}

async function completeConstruction(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.CONSTRUCTING]);
  if (isCaptain(user) && Number(project.captain_user_id) !== Number(user.id)) fail('captain_forbidden', 403);
  return withTransaction(db, async (conn) => {
    await conn.query(
      "UPDATE constructions SET status = 'completed', progress = 100, end_date = ? WHERE project_id = ?",
      [str(payload.end_date, { max: 20 }) || today(), projectId]
    );
    await conn.query('UPDATE projects SET status = ? WHERE id = ?', [STATUS.CONSTRUCTED, projectId]);
    await record(conn, {
      module: 'project', entity: 'construction', entityId: projectId, action: 'complete',
      actor: { id: user.id, name: user.name }, after: { status: 'completed' },
    });
    return { project_status: STATUS.CONSTRUCTED };
  });
}

/** 领料出库后由 inventory 域在同一个事务内调用。 */
async function markMaterialIssued(conn, projectId, actor = {}) {
  const [rows] = await conn.query('SELECT status FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (!rows.length) return null;
  if (rows[0].status !== STATUS.CONTRACTED) return null;
  await conn.query('UPDATE projects SET status = ? WHERE id = ?', [STATUS.MATERIAL_ISSUED, projectId]);
  await record(conn, {
    module: 'project', entity: 'project', entityId: projectId, action: 'material_issued',
    actor, before: { status: STATUS.CONTRACTED }, after: { status: STATUS.MATERIAL_ISSUED },
  });
  return { status: STATUS.MATERIAL_ISSUED };
}

// ---------------------------------------------------------------------------
// 验收 + 并网
// ---------------------------------------------------------------------------
async function createAcceptance(db, projectId, payload, user) {
  const project = await getProject(db, projectId, user);
  assertStatus(project, [STATUS.CONSTRUCTED, STATUS.ACCEPTED]);
  const gridStatus = ['pending', 'submitted', 'connected'].includes(payload.grid_status)
    ? payload.grid_status : 'pending';
  const nextStatus = gridStatus === 'connected' ? STATUS.GRID_CONNECTED : STATUS.ACCEPTED;

  return withTransaction(db, async (conn) => {
    const [existing] = await conn.query('SELECT * FROM acceptances WHERE project_id = ? LIMIT 1', [projectId]);
    const docIds = JSON.stringify(Array.isArray(payload.doc_ids) ? payload.doc_ids : []);
    let id;
    if (existing.length) {
      await conn.query(
        `UPDATE acceptances SET result = ?, accepted_at = ?, grid_status = ?, grid_connection_no = ?, doc_ids = ?, remark = ?
         WHERE id = ?`,
        [payload.result === 'failed' ? 'failed' : 'passed', str(payload.accepted_at, { max: 20 }) || today(),
          gridStatus, str(payload.grid_connection_no, { max: 80 }), docIds,
          str(payload.remark, { max: 500 }), existing[0].id]
      );
      id = existing[0].id;
    } else {
      const acceptanceNo = await nextCode(conn, 'acceptance', 'AC', { period: dayPeriod(), separator: '-', width: 4 });
      const [inserted] = await conn.query(
        `INSERT INTO acceptances
         (project_id, acceptance_no, result, accepted_at, grid_status, grid_connection_no, doc_ids, remark, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [projectId, acceptanceNo, payload.result === 'failed' ? 'failed' : 'passed',
          str(payload.accepted_at, { max: 20 }) || today(), gridStatus,
          str(payload.grid_connection_no, { max: 80 }), docIds, str(payload.remark, { max: 500 }), user.id]
      );
      id = inserted.insertId;
    }
    await conn.query('UPDATE projects SET status = ? WHERE id = ?', [nextStatus, projectId]);
    // 验收属于关键变更，必须留审计
    await record(conn, {
      module: 'project', entity: 'acceptance', entityId: id, action: 'accept',
      actor: { id: user.id, name: user.name },
      after: { project_id: projectId, grid_status: gridStatus, project_status: nextStatus },
    });
    return { id, grid_status: gridStatus, project_status: nextStatus };
  });
}

// ---------------------------------------------------------------------------
// 质保（尾款结清后自动登记）
// ---------------------------------------------------------------------------
async function markSettled(conn, projectId, actor = {}) {
  const [rows] = await conn.query('SELECT * FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (!rows.length) return null;
  const project = rows[0];
  if ([STATUS.SETTLED, STATUS.CLOSED].includes(project.status)) return null;

  const [exists] = await conn.query('SELECT * FROM warranties WHERE project_id = ? LIMIT 1', [projectId]);
  let warranty = exists[0] || null;
  if (!warranty) {
    const warrantyNo = await nextCode(conn, 'warranty', 'WT', { period: monthPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO warranties (project_id, warranty_no, start_date, end_date, scope, status)
       VALUES (?,?,CURDATE(),DATE_ADD(CURDATE(), INTERVAL 5 YEAR),?,'active')`,
      [projectId, warrantyNo, '光伏系统整体质保：组件 25 年、逆变器 5 年、施工 2 年']
    );
    warranty = { id: inserted.insertId, warranty_no: warrantyNo };
    await record(conn, {
      module: 'project', entity: 'warranty', entityId: inserted.insertId, action: 'create',
      actor, after: { project_id: projectId, warranty_no: warrantyNo },
    });
  }
  await conn.query('UPDATE projects SET status = ? WHERE id = ?', [STATUS.SETTLED, projectId]);
  await record(conn, {
    module: 'project', entity: 'project', entityId: projectId, action: 'settle',
    actor, before: { status: project.status }, after: { status: STATUS.SETTLED },
  });
  return warranty;
}

async function statusSummary(db, user) {
  const filter = projectFilter(user, 'p');
  const where = filter.sql ? `WHERE ${filter.sql}` : '';
  const [rows] = await db.query(
    `SELECT p.status, COUNT(*) AS total FROM projects p ${where} GROUP BY p.status`,
    filter.params
  );
  return rows;
}

module.exports = {
  STATUS,
  listCustomers, createCustomer, updateCustomer,
  listProjects, getProjectRaw, getProject, getProjectByNo, getProjectBundle, createFromOrder,
  saveSurvey, submitSurvey,
  createQuote, approveQuote,
  signContract,
  startConstruction, addConstructionLog, completeConstruction,
  markMaterialIssued,
  createAcceptance,
  markSettled, statusSummary,
};
