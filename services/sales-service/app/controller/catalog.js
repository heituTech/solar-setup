'use strict';

const { internalFetch } = require('@solar/service-kit');
const { num, parseJson } = require('../../lib/scope');
const { USER_CATEGORIES, isAllowedCategory, defaultUnitFor } = require('../../lib/products');
const { logProductChange } = require('../../lib/productLog');

function toProduct(row) {
  return {
    ...row,
    id: Number(row.id),
    price: num(row.price),
    specs: parseJson(row.specs, {}),
  };
}

function operatorOf(ctx) {
  const u = ctx.state.user || {};
  return { id: u.id ? Number(u.id) : null, name: u.name || null };
}

async function requestApproval(ctx, payload) {
  const data = await internalFetch(`${ctx.app.config.internal.services.identity}/pv/api/approvals`, {
    service: 'sales',
    body: { type: 'product_change', payload },
    headers: { authorization: ctx.get('authorization') },
    requestId: ctx.state.requestId,
  });
  return data;
}

module.exports = {
  // 用户可选的商品分类（英文），供前端下拉
  async categories(ctx) {
    ctx.body = { categories: USER_CATEGORIES };
  },

  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let sql = 'SELECT * FROM products WHERE 1 = 1';
    if (ctx.query.category) { sql += ' AND category = ?'; params.push(String(ctx.query.category)); }
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (q) { sql += ' AND (name LIKE ? OR model LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [countRows] = await ctx.app.db.query(countSql, params);
    const [rows] = await ctx.app.db.query(`${sql} ORDER BY category, model LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize]));
    ctx.body = { products: rows.map(toProduct), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const category = String(body.category || '').trim();
    if (!isAllowedCategory(category)) ctx.throw(400, 'invalid_category');
    const product = {
      category,
      model: String(body.model || '').trim(),
      name: String(body.name || '').trim(),
      specs: body.specs || {},
      price: Number(body.price || 0),
      unit: body.unit ? String(body.unit).trim() : defaultUnitFor(category),
    };
    if (!product.model || !product.name) ctx.throw(400, 'model_name_required');

    // 销售人员增删改商品需销售经理审批
    if (ctx.state.user.role === 'salesperson') {
      const approval = await requestApproval(ctx, { action: 'create', product });
      ctx.status = 202;
      ctx.body = { pending_approval: true, approval_id: approval.id };
      return;
    }

    const [result] = await ctx.app.db.query(
      'INSERT INTO products (category, model, name, specs, price, unit, status, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [product.category, product.model, product.name, JSON.stringify(product.specs), product.price,
        product.unit, 'active', Number(ctx.state.user.id)]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    const op = operatorOf(ctx);
    await logProductChange(ctx.app.db, {
      productId: Number(result.insertId), action: 'create',
      operatorId: op.id, operatorName: op.name, after: toProduct(rows[0]),
    });
    ctx.status = 201;
    ctx.body = { product: toProduct(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'product_not_found');
    const before = toProduct(rows[0]);

    const body = ctx.request.body || {};
    const patch = {};
    for (const field of ['category', 'model', 'name', 'unit', 'status']) {
      if (body[field] !== undefined) patch[field] = String(body[field]);
    }
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.specs !== undefined) patch.specs = body.specs;
    if (!Object.keys(patch).length) ctx.throw(400, 'no_fields');
    if (patch.category !== undefined && !isAllowedCategory(patch.category)) ctx.throw(400, 'invalid_category');

    if (ctx.state.user.role === 'salesperson') {
      const approval = await requestApproval(ctx, { action: 'update', product_id: id, product: patch });
      ctx.status = 202;
      ctx.body = { pending_approval: true, approval_id: approval.id };
      return;
    }

    const assignments = [];
    const params = [];
    for (const [key, value] of Object.entries(patch)) {
      assignments.push(`${key} = ?`);
      params.push(key === 'specs' ? JSON.stringify(value) : value);
    }
    params.push(id);
    await ctx.app.db.query(`UPDATE products SET ${assignments.join(', ')} WHERE id = ?`, params);
    const [fresh] = await ctx.app.db.query('SELECT * FROM products WHERE id = ?', [id]);
    const op = operatorOf(ctx);
    await logProductChange(ctx.app.db, {
      productId: id, action: 'update',
      operatorId: op.id, operatorName: op.name, before, after: toProduct(fresh[0]),
    });
    ctx.body = { product: toProduct(fresh[0]) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'product_not_found');
    const before = toProduct(rows[0]);

    // 系统内部分类（套餐 / 踏勘服务）受订单逻辑保护，不允许删除
    if (before.category === 'package' || before.category === 'survey_service') {
      ctx.throw(409, 'system_product_protected');
    }

    if (ctx.state.user.role === 'salesperson') {
      const approval = await requestApproval(ctx, { action: 'delete', product_id: id });
      ctx.status = 202;
      ctx.body = { pending_approval: true, approval_id: approval.id };
      return;
    }

    await ctx.app.db.query('DELETE FROM products WHERE id = ?', [id]);
    const op = operatorOf(ctx);
    await logProductChange(ctx.app.db, {
      productId: id, action: 'delete',
      operatorId: op.id, operatorName: op.name, before,
    });
    ctx.body = { id, deleted: true };
  },

  // 商品变更日志（可按 product_id 过滤）
  async logs(ctx) {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 20));
    const params = [];
    let where = 'WHERE 1 = 1';
    if (ctx.query.product_id) { where += ' AND product_id = ?'; params.push(Number(ctx.query.product_id)); }
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total FROM product_change_logs ${where}`, params);
    const [rows] = await ctx.app.db.query(
      `SELECT * FROM product_change_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize])
    );
    ctx.body = {
      logs: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        product_id: r.product_id ? Number(r.product_id) : null,
        operator_id: r.operator_id ? Number(r.operator_id) : null,
        approval_id: r.approval_id ? Number(r.approval_id) : null,
        before_data: r.before_data && typeof r.before_data === 'string' ? JSON.parse(r.before_data) : r.before_data,
        after_data: r.after_data && typeof r.after_data === 'string' ? JSON.parse(r.after_data) : r.after_data,
      })),
      total: Number(countRows[0].total), page, page_size: pageSize,
    };
  },
};
