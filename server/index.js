const express = require('express');
const path = require('path');
const productsRouter = require('./routes/products');
const configRouter = require('./routes/config');
const recommendRouter = require('./routes/recommend');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const approvalsRouter = require('./routes/approvals');
const quoteRouter = require('./routes/quote');
const casesRouter = require('./routes/cases');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// API routes
app.use('/api/products', productsRouter);
app.use('/api/config', configRouter);
app.use('/api/recommend', recommendRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin/users', usersRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/quote', quoteRouter);
app.use('/api/cases', casesRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Customer pages
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'home.html'));
});
app.get('/home/tool', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'tool.html'));
});
app.get('/member', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'member.html'));
});

// Staff pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Solar Setup server running on http://${HOST}:${PORT}`);
});
