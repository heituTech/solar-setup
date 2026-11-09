const express = require('express');
const path = require('path');
const productsRouter = require('./routes/products');
const configRouter = require('./routes/config');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const approvalsRouter = require('./routes/approvals');
const flowsRouter = require('./routes/flows');
const casesRouter = require('./routes/cases');
const skillsRouter = require('./routes/skills');
const geoRouter = require('./routes/geo');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

// Customer pages (declared before static so /pv is not redirected to /pv/)
app.get('/pv', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
});
app.get('/pv/home', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
});
app.get('/pv/tool', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tool.html'));
});
app.get('/pv/member', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'member.html'));
});
app.get('/pv/member/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'member-profile.html'));
});

// Staff pages
app.get('/pv/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/pv/account', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'account.html'));
});

// HTML must always be revalidated so users never run a stale page against new
// CSS/JS; static assets carry explicit ?v= versions for cache busting.
app.use('/pv', express.static(path.join(__dirname, '..', 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// API routes
app.use('/pv/api/products', productsRouter);
app.use('/pv/api/config', configRouter);
app.use('/pv/api/auth', authRouter);
app.use('/pv/api/admin/users', usersRouter);
app.use('/pv/api/approvals', approvalsRouter);
app.use('/pv/api/admin/flows', flowsRouter);
app.use('/pv/api/cases', casesRouter);
app.use('/pv/api/geo', geoRouter);
app.use('/pv/skill/member', skillsRouter);

// Health check
app.get('/pv/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, HOST, () => {
  console.log(`Solar Setup server running on http://${HOST}:${PORT}`);
});
