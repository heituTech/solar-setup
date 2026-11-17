'use strict';

const { internalFetch } = require('@solar/service-kit');
const { num, parseJson } = require('../../lib/scope');

function toProduct(row) {
  return {
    ...row,
    id: Number(row.id),
    price: num(row.price),
    specs: parseJson(row.specs, {}),
  };
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
  async list(ctx) {
    const params = [];
    let sql = 'SELECT * FROM products WHERE 1 = 1';
    if (ctx.query.category) { sql += ' AND category = ?'; params.push(String(ctx.query.category)); }
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    sql += ' ORDER BY category, model LIMIT 500';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { products: rows.map(toProduct) };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const product = {
      category: String(body.category || '').trim(),
      model: String(body.model || '').trim(),
      name: String(body.name || '').trim(),
      specs: body.specs || {},
      price: Number(body.price || 0),
      unit: body.unit || null,
    };
    if (!product.category || !product.model || !product.name) ctx.throw(400, 'category_model_name_required');
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
    ctx.status = 201;
    ctx.body = { product: toProduct(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'product_not_found');
    const body = ctx.request.body || {};
    const patch = {};
    for (const field of ['category', 'model', 'name', 'unit', 'status']) {
      if (body[field] !== undefined) patch[field] = String(body[field]);
    }
    if (body.price !== undefined) patch.price = Number(body.price);
    if (body.specs !== undefined) patch.specs = body.specs;
    if (!Object.keys(patch).length) ctx.throw(400, 'no_fields');
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
    ctx.body = { product: toProduct(fresh[0]) };
  },
};
