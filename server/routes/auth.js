const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db');

const router = express.Router();

/**
 * POST /api/auth/login
 * Admin paneli girişi
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }

    const db = getDb();
    const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [username]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    console.error('Login hatası:', err);
    res.status(500).json({ error: 'Giriş yapılamadı' });
  }
});

/**
 * GET /api/auth/me
 * Oturum kontrolü
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    res.json({ user: { id: decoded.id, username: decoded.username } });
  } catch {
    res.status(401).json({ error: 'Oturum geçersiz' });
  }
});

module.exports = router;
