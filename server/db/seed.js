const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb } = require('./index');

/**
 * Admin kullanıcısını oluşturur veya Vercel'de şifreyi günceller.
 */
async function seedAdmin(username, password) {
  const db = getDb();
  const existing = await db.get('SELECT id FROM admin_users WHERE username = ?', [username]);
  const hash = bcrypt.hashSync(password, 10);

  if (!existing) {
    await db.run(
      'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    console.log(`✓ Admin kullanıcı oluşturuldu: ${username}`);
  } else if (config.isVercel) {
    // Vercel'de ortam değişkenindeki şifreyi her deploy'da senkronize et
    await db.run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [hash, username]);
  }
}

module.exports = { seedAdmin };
