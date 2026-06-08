require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'pastera-dev-secret',
  timezone: process.env.TZ || 'Europe/Berlin',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'pastera123',
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,
  // Vercel Postgres — pooled URL öncelikli (serverless için)
  databaseUrl:
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || null,
  heartbeatTimeoutMs: 2 * 60 * 1000,
  pollIntervalMs: 5000,
};
