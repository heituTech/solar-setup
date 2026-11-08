const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const PUBLIC_USER_FIELDS = 'id, username, full_name, email, role, status, phone, phone_country, email_verified_at, created_at';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function authenticate(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const payload = jwt.verify(token, JWT_SECRET);
  const [rows] = await pool.query(`SELECT ${PUBLIC_USER_FIELDS}, password_hash FROM users WHERE id = ?`, [payload.sub]);
  const user = rows[0];
  if (!user || user.status !== 'active' || user.role !== payload.role) return null;
  delete user.password_hash;
  return user;
}

async function requireAuth(req, res, next) {
  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    req.user = await authenticate(req);
  } catch {
    req.user = null;
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

module.exports = {
  signToken,
  requireAuth,
  optionalAuth,
  requireRole,
  PUBLIC_USER_FIELDS,
};
