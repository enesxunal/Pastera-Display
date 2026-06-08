require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'pastera-dev-secret',
  timezone: process.env.TZ || 'Europe/Berlin',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'pastera123',
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,
  databaseUrl: process.env.DATABASE_URL || null,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || null,
  // Ekran çevrimiçi sayılması için son sinyal süresi (ms)
  heartbeatTimeoutMs: 2 * 60 * 1000,
  // Ekranların içerik kontrol aralığı (ms)
  pollIntervalMs: 5000,
};
