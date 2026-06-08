const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDbType } = require('./index');
const sb = require('./supabase');

async function seedAdmin(username, password) {
  if (getDbType() === 'supabase') {
    const existing = await sb.getAdminByUsername(username);
    if (existing) return;
    await sb.createAdmin(username, bcrypt.hashSync(password, 10));
    return;
  }
  const { getDb } = require('./index');
  const db = getDb();
  const existing = await db.get('SELECT id FROM admin_users WHERE username = ?', [username]);
  if (existing) return;
  await db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [
    username,
    bcrypt.hashSync(password, 10),
  ]);
}

module.exports = { seedAdmin };
