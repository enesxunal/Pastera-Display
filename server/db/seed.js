const bcrypt = require('bcryptjs');
const { getDb } = require('./index');

/**
 * İlk admin kullanıcısını oluşturur (yoksa).
 */
async function seedAdmin(username, password) {
  const db = getDb();
  const existing = await db.get('SELECT id FROM admin_users WHERE username = ?', [username]);

  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    await db.run(
      'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    console.log(`✓ Admin kullanıcı oluşturuldu: ${username}`);
  }
}

module.exports = { seedAdmin };
