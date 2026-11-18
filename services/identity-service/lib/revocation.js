'use strict';

// 已注销 token 的 jti 记录在 revoked_tokens 表中，剩余有效期内不得再通过鉴权。
async function isTokenRevoked(db, jti) {
  if (!jti) return false;
  const [rows] = await db.query(
    'SELECT 1 FROM revoked_tokens WHERE jti = ? AND expires_at > NOW() LIMIT 1',
    [jti]
  );
  return rows.length > 0;
}

module.exports = { isTokenRevoked };
