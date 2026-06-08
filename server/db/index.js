const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;
let dbType = 'sqlite';

/** ? parametrelerini PostgreSQL $1, $2 formatına çevirir */
function toPgParams(sql, params) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return { sql: pgSql, params };
}

/**
 * Veritabanı bağlantısını başlatır.
 * Yerelde SQLite, Vercel'de Postgres (Neon HTTP — hızlı cold start).
 */
async function initDatabase() {
  if (db) return db;

  if (config.databaseUrl) {
    dbType = 'postgres';
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(config.databaseUrl);
    await initPostgres(sql);
    db = createNeonAdapter(sql);
  } else if (config.isVercel) {
    throw new Error(
      'Vercel Postgres bağlı değil. Vercel → Storage → Postgres oluşturup projeye Connect edin.'
    );
  } else {
    dbType = 'sqlite';
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      throw new Error('Yerel çalıştırma için: npm install');
    }
    const dbPath = path.join(__dirname, '../../data/pastera.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    sqlite.exec(schema);
    db = createSqliteAdapter(sqlite);
  }

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Veritabanı henüz başlatılmadı. initDatabase() çağırın.');
  }
  return db;
}

function getDbType() {
  return dbType;
}

/** SQLite adapter */
function createSqliteAdapter(sqlite) {
  return {
    type: 'sqlite',
    run(sql, params = []) {
      const info = sqlite.prepare(sql).run(...params);
      return Promise.resolve({
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      });
    },
    get(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).get(...params) || null);
    },
    all(sql, params = []) {
      return Promise.resolve(sqlite.prepare(sql).all(...params));
    },
  };
}

/** Neon HTTP adapter — sql('SELECT ...', [params]) şeklinde çağrılır */
function createNeonAdapter(sql) {
  return {
    type: 'postgres',
    async run(queryStr, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(queryStr, params);
      const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
      const finalSql = isInsert && !pgSql.includes('RETURNING') ? `${pgSql} RETURNING id` : pgSql;
      const rows = await sql(finalSql, pgParams);
      return {
        changes: rows.length || 1,
        lastInsertRowid: rows[0]?.id,
      };
    },
    async get(queryStr, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(queryStr, params);
      const rows = await sql(pgSql, pgParams);
      return rows[0] || null;
    },
    async all(queryStr, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(queryStr, params);
      return sql(pgSql, pgParams);
    },
  };
}

/** PostgreSQL tablolarını oluştur (sadece ilk seferde) */
async function initPostgres(sql) {
  const check = await sql("SELECT to_regclass('public.screens') AS t");
  if (check[0]?.t) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      timezone TEXT DEFAULT 'Europe/Berlin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      branch_id INTEGER DEFAULT 1,
      default_media_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      url TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS playlist_items (
      id SERIAL PRIMARY KEY,
      screen_id INTEGER NOT NULL,
      media_id INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      display_duration INTEGER DEFAULT 10,
      start_time TEXT,
      end_time TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS screen_heartbeats (
      screen_id INTEGER PRIMARY KEY,
      last_seen TIMESTAMPTZ NOT NULL,
      user_agent TEXT,
      display_mode TEXT DEFAULT 'single'
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS content_version (
      id INTEGER PRIMARY KEY,
      version INTEGER DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];

  for (const q of statements) {
    await sql(q);
  }

  await sql(`INSERT INTO content_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`);
  await sql(`INSERT INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera') ON CONFLICT (id) DO NOTHING`);
  await sql(`
    INSERT INTO screens (id, name, slug) VALUES
      (1, 'Ekran 1', '1'),
      (2, 'Ekran 2', '2'),
      (3, 'Ekran 3', '3')
    ON CONFLICT (id) DO NOTHING
  `);
  await sql(`
    INSERT INTO settings (key, value) VALUES
      ('timezone', 'Europe/Berlin'),
      ('brand_name', 'Pastera'),
      ('default_image_duration', '10')
    ON CONFLICT (key) DO NOTHING
  `);
}

async function bumpContentVersion() {
  const database = getDb();
  if (database.type === 'postgres') {
    await database.run(
      `UPDATE content_version SET version = version + 1, updated_at = NOW() WHERE id = 1`
    );
  } else {
    await database.run(
      `UPDATE content_version SET version = version + 1, updated_at = datetime('now') WHERE id = 1`
    );
  }
}

async function getContentVersion() {
  const database = getDb();
  const row = await database.get('SELECT version FROM content_version WHERE id = 1');
  return row ? Number(row.version) : 1;
}

module.exports = {
  initDatabase,
  getDb,
  getDbType,
  bumpContentVersion,
  getContentVersion,
};
