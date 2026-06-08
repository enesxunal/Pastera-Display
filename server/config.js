require('dotenv').config();

/** Tüm olası Postgres env kaynaklarını tara */
function findRawUrl() {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
  ].filter(Boolean);

  if (candidates.length) return candidates[0];

  if (process.env.POSTGRES_HOST) {
    const user = process.env.POSTGRES_USER || 'postgres';
    const pass = process.env.POSTGRES_PASSWORD || '';
    const host = process.env.POSTGRES_HOST;
    const db = process.env.POSTGRES_DATABASE || 'postgres';
    const port = process.env.POSTGRES_PORT || '6543';
    return `postgres://${user}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
  }

  return null;
}

function isSupabase(url) {
  return url && url.includes('supabase.com');
}

function isNeon(url) {
  return url && url.includes('.neon.tech');
}

/** Supabase serverless — transaction pooler port 6543 */
function toSupabaseUrl(url) {
  try {
    const u = new URL(url);
    if (u.port === '5432' || !u.port) u.port = '6543';
    u.searchParams.set('pgbouncer', 'true');
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

/** Neon HTTP — pooler olmadan direct endpoint */
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

/** pg fallback — sslmode=no-verify */
function toPgUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (isNeon(u.toString()) && !u.hostname.includes('-pooler')) {
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
  isSupabaseDb: isSupabase(rawUrl),
  isNeonDb: isNeon(rawUrl),
  supabaseUrl: rawUrl && isSupabase(rawUrl) ? toSupabaseUrl(rawUrl) : null,
  neonHttpUrl: rawUrl && isNeon(rawUrl) ? toNeonHttpUrl(rawUrl) : null,
  pgUrl: rawUrl ? toPgUrl(rawUrl) : null,
  databaseUrl: rawUrl,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || null,
  heartbeatTimeoutMs: 2 * 60 * 1000,
  pollIntervalMs: 5000,
};
