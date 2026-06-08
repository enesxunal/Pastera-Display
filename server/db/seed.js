const bcrypt = require('bcryptjs');
const { getDb } = require('./index');

/** Admin yoksa oluştur — her istekte şifre güncelleme YOK (hız için) */
async function seedAdmin(username, password) {
  const db = getDb();
  const existing = await db.get('SELECT id FROM admin_users WHERE username = ?', [username]);
  if (existing) return;

  const hash = bcrypt.hashSync(password, 10);
  await db.run(
    'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  console.log(`✓ Admin oluşturuldu: ${username}`);
}

module.exports = { seedAdmin };
