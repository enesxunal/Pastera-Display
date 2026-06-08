const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let dbType = 'sqlite';
let queryFn = null;

function toPgParams(sql, params) {
  let i = 0;
  return { sql: sql.replace(/\?/g, () => `$${++i}`), params };
}

async function withRetry(fn, label = 'DB', attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`${label} ${i + 1}/${attempts}:`, err.message);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Neon HTTP bağlantısı — SSL sertifika sorunu YOK (HTTPS fetch kullanır) */
async function connectNeonHttp() {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(config.neonHttpUrl);

  const exec = async (text, params = []) => {
    const rows = await sql(text, params);
    return { rows: rows || [], rowCount: (rows || []).length };
  };

  await withRetry(() => sql('SELECT 1'), 'Neon HTTP');
  return exec;
}

/** pg TCP fallback — sslmode=no-verify */
async function connectPg() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: config.pgUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 20000,
  });

  const exec = async (text, params = []) => pool.query(text, params);

  await withRetry(() => pool.query('SELECT 1'), 'pg Pool');
  return exec;
}

async function initDatabase() {
  if (db) return db;

  if (config.rawDatabaseUrl) {
    dbType = 'postgres';

    // Vercel: önce Neon HTTP (SSL sorunu olmaz)
    if (config.isVercel && config.neonHttpUrl) {
      try {
        queryFn = await connectNeonHttp();
      } catch (neonErr) {
        console.warn('Neon HTTP başarısız, pg deneniyor:', neonErr.message);
        queryFn = await connectPg();
      }
    } else {
      queryFn = await connectPg();
    }

    await initPostgres(queryFn);
    db = createPostgresAdapter(queryFn);
  } else if (config.isVercel) {
    throw new Error('Postgres bağlı değil. Vercel → Storage → Postgres → Connect to Project');
  } else {
    dbType = 'sqlite';
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      throw new Error('Yerel: npm install');
    }
    const dbPath = path.join(__dirname, '../../data/pastera.db');
    if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    db = createSqliteAdapter(sqlite);
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Veritabanı başlatılmadı.');
  return db;
}

function getDbType() {
  return dbType;
}

function createSqliteAdapter(sqlite) {
  return {
    type: 'sqlite',
    run(sql, params = []) {
      const info = sqlite.prepare(sql).run(...params);
      return Promise.resolve({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
    },
    get(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).get(...params) || null);
    },
    all(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).all(...params));
    },
  };
}

function createPostgresAdapter(exec) {
  return {
    type: 'postgres',
    async run(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
      const finalSql = isInsert && !pgSql.includes('RETURNING') ? `${pgSql} RETURNING id` : pgSql;
      const result = await exec(finalSql, pgParams);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    },
    async get(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const result = await exec(pgSql, pgParams);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const result = await exec(pgSql, pgParams);
      return result.rows;
    },
  };
}

async function initPostgres(exec) {
  const check = await exec("SELECT to_regclass('public.screens') AS t");
  if (check.rows[0]?.t) return;

  const tables = [
    `CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      timezone TEXT DEFAULT 'Europe/Berlin', created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      branch_id INTEGER DEFAULT 1, default_media_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL, media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      url TEXT NOT NULL, file_size INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS playlist_items (
      id SERIAL PRIMARY KEY, screen_id INTEGER NOT NULL, media_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0, display_duration INTEGER DEFAULT 10,
      start_time TEXT, end_time TEXT, is_default BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS screen_heartbeats (
      screen_id INTEGER PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL,
      user_agent TEXT, display_mode TEXT DEFAULT 'single')`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS content_version (
      id INTEGER PRIMARY KEY, version INTEGER DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT NOW())`,
  ];

  for (const q of tables) await exec(q);
  await exec(`INSERT INTO content_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`);
  await exec(`INSERT INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera') ON CONFLICT (id) DO NOTHING`);
  await exec(`INSERT INTO screens (id, name, slug) VALUES (1,'Ekran 1','1'),(2,'Ekran 2','2'),(3,'Ekran 3','3') ON CONFLICT (id) DO NOTHING`);
  await exec(`INSERT INTO settings (key, value) VALUES ('timezone','Europe/Berlin'),('brand_name','Pastera'),('default_image_duration','10') ON CONFLICT (key) DO NOTHING`);
}

async function bumpContentVersion() {
  const d = getDb();
  if (d.type === 'postgres') {
    await d.run(`UPDATE content_version SET version = version + 1, updated_at = NOW() WHERE id = 1`);
  } else {
    await d.run(`UPDATE content_version SET version = version + 1, updated_at = datetime('now') WHERE id = 1`);
  }
}

async function getContentVersion() {
  const row = await getDb().get('SELECT version FROM content_version WHERE id = 1');
  return row ? Number(row.version) : 1;
}

module.exports = { initDatabase, getDb, getDbType, bumpContentVersion, getContentVersion };
