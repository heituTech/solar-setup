'use strict';

const ALI_BASE = 'https://alimail-cn.aliyuncs.com';

let tokenCache = { token: null, expiresAt: 0 };
let transporter = null;

async function getAliAccessToken(mail) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const response = await fetch(`${ALI_BASE}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
      + `&client_id=${encodeURIComponent(mail.alimail.appId)}`
      + `&client_secret=${encodeURIComponent(mail.alimail.appSecret)}`,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.access_token) {
    throw new Error('alimail token failed: ' + (data ? JSON.stringify(data) : `HTTP ${response.status}`));
  }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((Number(data.expires_in) || 7200) * 1000) - 60000,
  };
  return tokenCache.token;
}

async function sendViaAliMail(mail, { to, subject, text, html, senderName }) {
  const token = await getAliAccessToken(mail);
  const sender = mail.alimail.sender;
  const created = await fetch(`${ALI_BASE}/v2/users/${encodeURIComponent(sender)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message: {
        subject,
        from: { email: sender, name: senderName || 'HEITU ERP' },
        toRecipients: [{ email: to }],
        body: { bodyText: text, bodyHtml: html },
      },
    }),
  }).then((response) => response.json().catch(() => null));
  const draftId = created && created.message && created.message.id;
  if (!draftId) throw new Error('alimail create draft failed: ' + JSON.stringify(created));

  const sent = await fetch(
    `${ALI_BASE}/v2/users/${encodeURIComponent(sender)}/messages/${encodeURIComponent(draftId)}/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ saveToSentItems: true }),
    }
  );
  if (!sent.ok) throw new Error(`alimail send failed: HTTP ${sent.status}`);
}

function getTransporter(mail) {
  if (transporter) return transporter;
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: mail.smtp.host,
    port: mail.smtp.port,
    secure: mail.smtp.secure,
    auth: { user: mail.smtp.user, pass: mail.smtp.pass },
  });
  return transporter;
}

async function sendMail(mail, message) {
  if (mail.devMode) {
    console.log(`[MAIL DEV] to=${message.to} subject=${message.subject}`);
    return { dev: true };
  }
  if (mail.alimail.appId && mail.alimail.appSecret) {
    await sendViaAliMail(mail, message);
    return { dev: false };
  }
  if (mail.smtp.host && mail.smtp.pass) {
    await getTransporter(mail).sendMail({
      from: mail.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { dev: false };
  }
  throw new Error('mail_not_configured');
}

module.exports = { sendMail };
