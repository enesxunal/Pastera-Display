require('dotenv').config();

/** Ham Postgres URL'sini bul */
function findRawUrl() {
  let url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null;

  if (!url && process.env.POSTGRES_HOST) {
    const user = process.env.POSTGRES_USER || 'default';
    const pass = process.env.POSTGRES_PASSWORD || '';
    const host = process.env.POSTGRES_HOST;
    const db = process.env.POSTGRES_DATABASE || 'verceldb';
    url = `postgres://${user}:${encodeURIComponent(pass)}@${host}/${db}`;
  }

  return url;
}

/** Neon HTTP driver için — pooler OLMADAN direct endpoint */
function toNeonHttpUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('-pooler')) {
      u.hostname = u.hostname.replace('-pooler', '');
    }
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url.replace('-pooler', '');
  }
}

/** pg fallback için — pooler + sslmode=no-verify */
function toPgUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('.neon.tech') && !u.hostname.includes('-pooler')) {
      const parts = u.hostname.split('.');
      parts[0] = parts[0] + '-pooler';
      u.hostname = parts.join('.');
    }
    u.searchParams.delete('sslmode');
    u.searchParams.set('sslmode', 'no-verify');
    return u.toString();
  } catch {
    return url;
  }
}

const rawUrl = findRawUrl();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'pastera-dev-secret',
  timezone: process.env.TZ || 'Europe/Berlin',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'pastera123',
  isProduction: process.env.NODE_ENV === 'production',
  isVercel: !!process.env.VERCEL,
  rawDatabaseUrl: rawUrl,
  neonHttpUrl: toNeonHttpUrl(rawUrl),
  pgUrl: toPgUrl(rawUrl),
  databaseUrl: rawUrl,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || null,
  heartbeatTimeoutMs: 2 * 60 * 1000,
  pollIntervalMs: 5000,
};
