require('dotenv').config();

/**
 * Vercel/Neon Postgres bağlantı URL'sini bul ve serverless için pooler'a çevir
 */
function resolveDatabaseUrl() {
  let url =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null;

  // Parçalı env değişkenlerinden oluştur
  if (!url && process.env.POSTGRES_HOST) {
    const user = process.env.POSTGRES_USER || 'default';
    const pass = process.env.POSTGRES_PASSWORD || '';
    const host = process.env.POSTGRES_HOST;
    const db = process.env.POSTGRES_DATABASE || 'verceldb';
    url = `postgres://${user}:${encodeURIComponent(pass)}@${host}/${db}?sslmode=require`;
  }

  if (!url) return null;

  // Neon serverless: pooler endpoint kullan (fetch/TCP için gerekli)
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('.neon.tech') && !parsed.hostname.includes('-pooler')) {
      const parts = parsed.hostname.split('.');
      parts[0] = parts[0] + '-pooler';
      parsed.hostname = parts.join('.');
      url = parsed.toString();
    }
  } catch {
    // URL parse edilemezse olduğu gibi kullan
  }

  return url;
}

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'pastera-dev-secret',
  timezone: process.env.TZ || 'Europe/Berlin',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'pastera123',
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,
  databaseUrl: resolveDatabaseUrl(),
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || null,
  heartbeatTimeoutMs: 2 * 60 * 1000,
  pollIntervalMs: 5000,
};
