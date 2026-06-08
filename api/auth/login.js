/**
 * Hafif giriş endpoint'i — Express yüklenmez, anında yanıt
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env eksik');
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return supabase;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  try {
    let body = req.body;
    if (!body && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    }
    const { username, password } = body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    }

    const { data: user, error } = await getSupabase()
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'pastera-dev-secret',
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (err) {
    console.error('Login:', err);
    return res.status(500).json({ error: err.message || 'Giriş yapılamadı' });
  }
};
