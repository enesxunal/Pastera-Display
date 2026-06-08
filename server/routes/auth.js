const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDbType } = require('../db');
const sb = require('../db/supabase');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }

    let user;
    if (getDbType() === 'supabase') {
      user = await sb.getAdminByUsername(username);
    } else {
      const { getDb } = require('../db');
      user = await getDb().get('SELECT * FROM admin_users WHERE username = ?', [username]);
    }

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Login hatası:', err);
    res.status(500).json({ error: err.message || 'Giriş yapılamadı' });
  }
});

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Giriş gerekli' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    res.json({ user: { id: decoded.id, username: decoded.username } });
  } catch {
    res.status(401).json({ error: 'Oturum geçersiz' });
  }
});

module.exports = router;
