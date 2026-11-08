const nodemailer = require('nodemailer');

let transporter = null;
let tokenCache = { token: null, expiresAt: 0 };

const ALI_BASE = 'https://alimail-cn.aliyuncs.com';

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qiye.aliyun.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER || 'public@heitu.tech',
      pass: process.env.SMTP_PASS || '',
    },
  });
  return transporter;
}

async function getAliAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const r = await fetch(`${ALI_BASE}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
      + `&client_id=${encodeURIComponent(process.env.ALI_MAIL_APP_ID)}`
      + `&client_secret=${encodeURIComponent(process.env.ALI_MAIL_APP_SECRET)}`,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data || !data.access_token) {
    throw new Error('alimail token failed: ' + (data ? JSON.stringify(data) : `HTTP ${r.status}`));
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((Number(data.expires_in) || 7200) * 1000) - 60000,
  };
  return tokenCache.token;
}

async function sendViaAliMail({ to, subject, text, html }) {
  const token = await getAliAccessToken();
  const mailbox = process.env.ALI_MAIL_SENDER || 'public@heitu.tech';

  const createRes = await fetch(`${ALI_BASE}/v2/users/${encodeURIComponent(mailbox)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      message: {
        subject,
        from: { email: mailbox, name: 'Solar Setup' },
        toRecipients: [{ email: to }],
        body: { bodyText: text, bodyHtml: html },
      },
    }),
  });
  const created = await createRes.json().catch(() => null);
  const draftId = created && created.message && created.message.id;
  if (!createRes.ok || !draftId) {
    throw new Error('alimail create draft failed: ' + (created ? JSON.stringify(created) : `HTTP ${createRes.status}`));
  }

  const sendRes = await fetch(`${ALI_BASE}/v2/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(draftId)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ saveToSentItems: true }),
  });
  if (!sendRes.ok) {
    const errText = await sendRes.text().catch(() => '');
    throw new Error(`alimail send failed: HTTP ${sendRes.status} ${errText}`);
  }
}

async function sendVerificationCode(email, code) {
  const devMode = process.env.MAIL_DEV_MODE !== 'false';
  if (devMode) {
    console.log(`[MAIL DEV] Verification code for ${email}: ${code}`);
    return { dev: true };
  }

  const subject = 'Solar Setup email verification code';
  const text = `Your verification code is ${code}. It expires in 10 minutes.`;
  const html = `<p>Your Solar Setup verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes.</p>`;

  if (process.env.ALI_MAIL_APP_ID && process.env.ALI_MAIL_APP_SECRET) {
    await sendViaAliMail({ to: email, subject, text, html });
    return { dev: false };
  }

  if (!process.env.SMTP_PASS) {
    throw new Error('SMTP_PASS is not configured');
  }
  const from = process.env.MAIL_FROM || 'Solar Setup <public@heitu.tech>';
  await getTransporter().sendMail({ from, to: email, subject, text, html });
  return { dev: false };
}

module.exports = { sendVerificationCode };
