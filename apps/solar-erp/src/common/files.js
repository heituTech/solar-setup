'use strict';

const fs = require('fs/promises');
const path = require('path');
const { withTransaction } = require('./db');
const { nextCode, dayPeriod } = require('./codes');
const { badRequest, notFound, pageParams, paged, str, actorOf, unauthorized } = require('./http');
const { verifyToken, loadUser } = require('./auth');

const MAX_SIZE = 20 * 1024 * 1024;

function safeName(filename) {
  const base = path.basename(String(filename || 'file')).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
  return base.slice(-120) || 'file';
}

/**
 * 文件服务：图纸、勘测照片、并网回执、合同 PDF 统一存这里，
 * 业务表只保存 file id，便于后续替换为对象存储。
 */
async function upload(ctx) {
  const body = ctx.request.body || {};
  const filename = safeName(body.filename);
  if (!body.content_base64) badRequest('file_content_required');
  let buffer;
  try {
    buffer = Buffer.from(String(body.content_base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  } catch {
    badRequest('invalid_file_content');
  }
  if (!buffer.length) badRequest('empty_file');
  if (buffer.length > MAX_SIZE) badRequest('file_too_large');

  const actor = actorOf(ctx);
  const baseDir = ctx.app.config.erp.uploadDir;
  const subDir = dayPeriod();
  const dir = path.join(baseDir, subDir);
  await fs.mkdir(dir, { recursive: true });

  const result = await withTransaction(ctx.app.db, async (conn) => {
    const fileNo = await nextCode(conn, 'file', 'FL', { period: dayPeriod(), width: 4 });
    const storedPath = path.join(subDir, `${fileNo}${path.extname(filename)}`);
    await fs.writeFile(path.join(baseDir, storedPath), buffer);

    const [inserted] = await conn.query(
      `INSERT INTO files (file_no, biz_type, biz_id, filename, mime, size, path, uploaded_by, uploaded_by_name)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [fileNo, str(body.biz_type, { max: 40 }), body.biz_id || null, filename,
        str(body.mime, { max: 120 }) || 'application/octet-stream', buffer.length, storedPath,
        actor.id, actor.name]
    );
    return { id: inserted.insertId, file_no: fileNo, filename };
  });

  ctx.body = { ...result, url: `/erp/api/files/${result.id}` };
}

async function download(ctx) {
  // 浏览器 <a> 无法带请求头，支持 ?token= 方式校验登录态
  const header = ctx.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : String(ctx.query.token || '');
  if (!token) unauthorized('unauthorized');
  let payload;
  try { payload = verifyToken(token); } catch { unauthorized('unauthorized'); }
  const user = await loadUser(ctx.app.db, payload.sub);
  if (!user || user.status !== 'active') unauthorized('unauthorized');

  const id = Number(ctx.params.id);
  const [rows] = await ctx.app.db.query('SELECT * FROM files WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('file_not_found');
  const file = rows[0];
  const buffer = await fs.readFile(path.join(ctx.app.config.erp.uploadDir, file.path));
  ctx.type = file.mime || 'application/octet-stream';
  ctx.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  ctx.body = buffer;
}

async function list(ctx) {
  const { page, pageSize, offset } = pageParams(ctx.query);
  const where = [];
  const params = [];
  if (ctx.query.biz_type) { where.push('biz_type = ?'); params.push(ctx.query.biz_type); }
  if (ctx.query.biz_id) { where.push('biz_id = ?'); params.push(Number(ctx.query.biz_id)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await ctx.app.db.query(`SELECT COUNT(*) AS total FROM files ${clause}`, params);
  const [items] = await ctx.app.db.query(
    `SELECT id, file_no, biz_type, biz_id, filename, mime, size, uploaded_by_name, created_at
     FROM files ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ctx.body = paged(items.map((row) => ({ ...row, url: `/erp/api/files/${row.id}` })), total, page, pageSize);
}

function mount(router, auth) {
  router.post('/erp/api/files', auth, upload);
  router.get('/erp/api/files', auth, list);
  router.get('/erp/api/files/:id', download);
}

module.exports = { mount, upload, download, list };
