const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let dbType = 'sqlite';

function toPgParams(sql, params) {
  let i = 0;
  return { sql: sql.replace(/\?/g, () => `$${++i}`), params };
}

/** Hızlı retry — Vercel Hobby max 10 saniye */
async function withRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

async function connectSupabase() {
  const { Pool } = require('pg');
  const urls = [config.rawDatabaseUrl, config.supabaseUrl].filter(Boolean);
  const unique = [...new Set(urls)];

  let lastErr;
  for (const url of unique) {
    try {
      const pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        max: 1,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 5000,
      });
      await pool.query('SELECT 1');
      return async (text, params = []) => pool.query(text, params);
    } catch (err) {
      lastErr = err;
      console.warn('Supabase URL denendi, başarısız:', url.slice(0, 40) + '...');
    }
  }
  throw lastErr;
}

async function connectNeonHttp() {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(config.neonHttpUrl);
  await sql('SELECT 1');
  return async (text, params = []) => {
    const rows = await sql(text, params);
    return { rows: rows || [], rowCount: (rows || []).length };
  };
}

async function connectPg() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: config.pgUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 8000,
  });
  await pool.query('SELECT 1');
  return async (text, params = []) => pool.query(text, params);
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  timezone TEXT DEFAULT 'Europe/Berlin', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS screens (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  branch_id INTEGER DEFAULT 1, default_media_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY, filename TEXT NOT NULL, original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL, media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL, file_size INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS playlist_items (
  id SERIAL PRIMARY KEY, screen_id INTEGER NOT NULL, media_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0, display_duration INTEGER DEFAULT 10,
  start_time TEXT, end_time TEXT, is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS screen_heartbeats (
  screen_id INTEGER PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL,
  user_agent TEXT, display_mode TEXT DEFAULT 'single');
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_version (
  id INTEGER PRIMARY KEY, version INTEGER DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT NOW());
INSERT INTO content_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera') ON CONFLICT (id) DO NOTHING;
INSERT INTO screens (id, name, slug) VALUES (1,'Ekran 1','1'),(2,'Ekran 2','2'),(3,'Ekran 3','3') ON CONFLICT (id) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('timezone','Europe/Berlin'),('brand_name','Pastera'),('default_image_duration','10') ON CONFLICT (key) DO NOTHING;
`;

async function initDatabase() {
  if (db) return db;

  if (config.rawDatabaseUrl) {
    dbType = 'postgres';
    let exec;

    if (config.isSupabaseDb) {
      exec = await withRetry(() => connectSupabase());
    } else if (config.isNeonDb && config.neonHttpUrl) {
      try {
        exec = await withRetry(() => connectNeonHttp());
      } catch {
        exec = await withRetry(() => connectPg());
      }
    } else {
      exec = await withRetry(() => connectPg());
    }

    const check = await exec("SELECT to_regclass('public.screens') AS t");
    if (!check.rows[0]?.t) {
      await exec(SCHEMA_SQL);
    }

    db = createPostgresAdapter(exec);
  } else if (config.isVercel) {
    throw new Error('POSTGRES_URL bulunamadı. Supabase → Connect to Project yapın.');
  } else {
    dbType = 'sqlite';
    let Database;
    try { Database = require('better-sqlite3'); } catch { throw new Error('npm install'); }
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

function getDbType() { return dbType; }

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
