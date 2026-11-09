// Skill knowledge bases for members. These markdown files are meant to be
// attached to free AI web chats / APIs by logged-in members, so the endpoints
// require a valid member token. The server only serves static file content —
// no business logic here.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const FILES = {
  app: path.join(__dirname, '..', 'skills', 'member-app.md'),
  solar_config: path.join(__dirname, '..', 'skills', 'solar-config.md'),
};

const cache = {};
function readSkill(name) {
  if (!cache[name]) cache[name] = fs.readFileSync(FILES[name], 'utf8');
  return cache[name];
}

router.use(requireAuth, requireRole('member'));

for (const name of Object.keys(FILES)) {
  router.get('/' + name, (req, res) => {
    try {
      res.type('text/markdown; charset=utf-8').send(readSkill(name));
    } catch {
      res.status(404).json({ error: 'skill_not_found' });
    }
  });
}

module.exports = router;
