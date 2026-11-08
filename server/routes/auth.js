const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, requireAuth, PUBLIC_USER_FIELDS } = require('../middleware/auth');
const { sendVerificationCode } = require('../services/mailer');
const {
  digitsOnly,
  findCountry,
  composePhone,
  phoneMatchCandidates,
  crossCountryPhoneCandidates,
  detectCountryFromPhone,
} = require('../services/phones');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_.-]{3,40}$/;
const CODE_TTL_MINUTES = 10;
const CODE_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function duplicateErrorKey(message) {
  const text = String(message || '');
  if (text.includes('uq_users_username')) return 'username_exists';
  if (text.includes('uq_users_email')) return 'email_exists';
  if (text.includes('uq_users_phone')) return 'phone_exists';
  return null;
}

async function getUserById(id) {
  const [rows] = await pool.query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

function phoneAmbiguousError(codes) {
  const err = new Error('phone_ambiguous');
  err.code = 'PHONE_AMBIGUOUS';
  err.options = codes.map((code) => {
    const country = findCountry(code);
    return { code, dial: country ? country.dial : '', name: country ? country.name : code };
  });
  return err;
}

async function queryUsersByPhone(candidates) {
  if (!candidates.length) return [];
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_USER_FIELDS}, password_hash FROM users
     WHERE REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') IN (${candidates.map(() => '?').join(',')})`,
    candidates
  );
  return rows;
}

async function findUserByIdentifier(identifier, countryCode) {
  const text = String(identifier || '').trim();
  const lower = text.toLowerCase();
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_USER_FIELDS}, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1`,
    [lower, lower]
  );
  if (rows.length) return rows[0];

  // An explicitly chosen country (or an international number such as +855...)
  // resolves directly, no disambiguation needed.
  const chosen = countryCode ? findCountry(countryCode) : detectCountryFromPhone(text);
  if (chosen) {
    const phoneRows = await queryUsersByPhone(phoneMatchCandidates(text, chosen.code));
    return phoneRows[0] || null;
  }

  // A bare local number may be registered under several calling codes.
  const phoneRows = await queryUsersByPhone(crossCountryPhoneCandidates(text));
  if (!phoneRows.length) return null;

  const distinct = [];
  phoneRows.forEach((row) => {
    const code = String(row.phone_country || 'KH').toUpperCase();
    if (!distinct.includes(code)) distinct.push(code);
  });
  if (distinct.length > 1) throw phoneAmbiguousError(distinct);
  return phoneRows[0];
}

// Verify a stored email code inside an open transaction. Returns null on success
// or an error key that the caller should send back.
async function consumeEmailCode(conn, email, purpose, code) {
  const [codes] = await conn.query(
    `SELECT * FROM email_codes
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [email, purpose]
  );
  const record = codes[0];
  if (!record || new Date(record.expires_at).getTime() < Date.now()) return 'code_expired';
  if (record.attempts >= MAX_ATTEMPTS) {
    await conn.query('UPDATE email_codes SET consumed_at = NOW() WHERE id = ?', [record.id]);
    return 'too_many_attempts';
  }
  if (record.code_hash !== hashCode(code)) {
    await conn.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    return 'invalid_code';
  }
  await conn.query('UPDATE email_codes SET consumed_at = NOW() WHERE id = ?', [record.id]);
  return null;
}

router.post('/login', async (req, res) => {
  const identifier = String(req.body.identifier || req.body.username || req.body.email || req.body.phone || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ error: 'identifier_and_password_required' });

  try {
    const user = await findUserByIdentifier(identifier, req.body.phone_country);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (user.status !== 'active') return res.status(403).json({ error: 'account_disabled' });
    delete user.password_hash;
    res.json({ token: signToken(user), user });
  } catch (e) {
    if (e && e.code === 'PHONE_AMBIGUOUS') {
      return res.status(409).json({ error: 'phone_ambiguous', options: e.options });
    }
    res.status(500).json({ error: e.message });
  }
});

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const purpose = req.body.purpose === 'login' ? 'login' : 'register';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });

  try {
    if (purpose === 'login') {
      // Do not reveal whether an account exists; silently skip sending for unknown emails.
      const [userRows] = await pool.query('SELECT id FROM users WHERE email = ? AND status = ? LIMIT 1', [email, 'active']);
      if (!userRows.length) return res.json({ ok: true, dev_mode: process.env.MAIL_DEV_MODE !== 'false' });
    }

    const [recent] = await pool.query(
      `SELECT id FROM email_codes
       WHERE email = ? AND purpose = ?
         AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY id DESC LIMIT 1`,
      [email, purpose, CODE_COOLDOWN_SECONDS]
    );
    if (recent.length) return res.status(429).json({ error: 'code_too_frequent' });

    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    await pool.query(
      `INSERT INTO email_codes (email, purpose, code_hash, expires_at, ip)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
      [email, purpose, hashCode(code), CODE_TTL_MINUTES, req.ip || null]
    );
    await sendVerificationCode(email, code);
    res.json({ ok: true, dev_mode: process.env.MAIL_DEV_MODE !== 'false' });
  } catch (e) {
    console.error('request-code failed:', e.message);
    res.status(500).json({ error: 'code_send_failed' });
  }
});

router.post('/login-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const codeError = await consumeEmailCode(conn, email, 'login', code);
    if (codeError) {
      await conn.commit();
      return res.status(400).json({ error: codeError });
    }
    const [rows] = await conn.query(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE email = ? LIMIT 1`, [email]);
    const user = rows[0];
    if (!user) {
      await conn.commit();
      return res.status(400).json({ error: 'invalid_code' });
    }
    if (user.status !== 'active') {
      await conn.commit();
      return res.status(403).json({ error: 'account_disabled' });
    }
    await conn.commit();
    res.json({ token: signToken(user), user });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

router.post('/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const countryCode = String(req.body.phone_country || 'KH').toUpperCase();
  const phone = composePhone(req.body.phone, countryCode);
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  const fullName = String(req.body.full_name || '').trim();
  const role = req.body.role === 'salesperson' ? 'salesperson' : 'member';

  if (!username) return res.status(400).json({ error: 'username_required' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'invalid_username' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!findCountry(countryCode)) return res.status(400).json({ error: 'invalid_phone_country' });
  if (!phone || digitsOnly(phone).length < 6) return res.status(400).json({ error: 'invalid_phone' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (!fullName) return res.status(400).json({ error: 'full_name_required' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const codeError = await consumeEmailCode(conn, email, 'register', code);
    if (codeError) {
      await conn.rollback();
      return res.status(400).json({ error: codeError });
    }

    const [existing] = await conn.query(
      'SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );
    if (existing.length) {
      const row = existing[0];
      await conn.rollback();
      if (row.username === username) return res.status(409).json({ error: 'username_exists' });
      return res.status(409).json({ error: 'email_exists' });
    }

    const phoneCandidates = phoneMatchCandidates(phone, countryCode);
    if (phoneCandidates.length) {
      const [phoneRows] = await conn.query(
        `SELECT id FROM users
         WHERE REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') IN (${phoneCandidates.map(() => '?').join(',')})
         LIMIT 1`,
        phoneCandidates
      );
      if (phoneRows.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'phone_exists' });
      }
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const [result] = await conn.query(
      `INSERT INTO users
       (username, email, password_hash, role, status, full_name, phone, phone_country, email_verified_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, NOW())`,
      [username, email, passwordHash, role, fullName.slice(0, 100), phone, countryCode]
    );
    await conn.commit();

    const user = await getUserById(result.insertId);
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    const dupKey = duplicateErrorKey(e.message);
    if (dupKey) return res.status(409).json({ error: dupKey });
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await getUserById(req.user.id) });
});

router.patch('/me', requireAuth, async (req, res) => {
  if (req.user.role !== 'member') return res.status(403).json({ error: 'forbidden' });
  const fields = [];
  const values = [];
  if ('full_name' in req.body) {
    const fullName = String(req.body.full_name || '').trim();
    if (!fullName) return res.status(400).json({ error: 'full_name_required' });
    fields.push('full_name = ?');
    values.push(fullName.slice(0, 100));
  }
  if ('phone' in req.body) {
    const phone = composePhone(req.body.phone, req.body.phone_country || req.user.phone_country || 'KH');
    if (!phone || digitsOnly(phone).length < 6) return res.status(400).json({ error: 'invalid_phone' });
    fields.push('phone = ?', 'phone_country = ?');
    values.push(phone, String(req.body.phone_country || req.user.phone_country || 'KH').toUpperCase());
  }
  if (!fields.length) return res.status(400).json({ error: 'no_updates' });

  try {
    values.push(req.user.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ user: await getUserById(req.user.id) });
  } catch (e) {
    const dupKey = duplicateErrorKey(e.message);
    if (dupKey) return res.status(409).json({ error: dupKey });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
