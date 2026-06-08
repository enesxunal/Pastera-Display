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
 * Yerelde SQLite, Vercel'de DATABASE_URL varsa PostgreSQL kullanır.
 */
async function initDatabase() {
  if (db) return db;

  if (config.databaseUrl) {
    dbType = 'postgres';
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.isProduction ? { rejectUnauthorized: false } : false,
    });
    await initPostgres(pool);
    db = createPostgresAdapter(pool);
  } else {
    dbType = 'sqlite';
    const Database = require('better-sqlite3');
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

/** SQLite adapter - tüm metodlar Promise döndürür */
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

/** PostgreSQL adapter */
function createPostgresAdapter(pool) {
  return {
    type: 'postgres',
    async run(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
      const returningSql = isInsert && !pgSql.includes('RETURNING') ? `${pgSql} RETURNING id` : pgSql;
      const result = await pool.query(returningSql, pgParams);
      return {
        changes: result.rowCount,
        lastInsertRowid: result.rows[0]?.id,
      };
    },
    async get(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const result = await pool.query(pgSql, pgParams);
      return result.rows[0] || null;
    },
    async all(sql, params = []) {
      const { sql: pgSql, params: pgParams } = toPgParams(sql, params);
      const result = await pool.query(pgSql, pgParams);
      return result.rows;
    },
    pool,
  };
}

/** PostgreSQL tablolarını oluştur */
async function initPostgres(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      timezone TEXT DEFAULT 'Europe/Berlin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS screens (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      branch_id INTEGER DEFAULT 1,
      default_media_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      url TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
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
    );

    CREATE TABLE IF NOT EXISTS screen_heartbeats (
      screen_id INTEGER PRIMARY KEY,
      last_seen TIMESTAMPTZ NOT NULL,
      user_agent TEXT,
      display_mode TEXT DEFAULT 'single'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_version (
      id INTEGER PRIMARY KEY,
      version INTEGER DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO content_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
    INSERT INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera') ON CONFLICT (slug) DO NOTHING;
    INSERT INTO screens (id, name, slug) VALUES
      (1, 'Ekran 1', '1'),
      (2, 'Ekran 2', '2'),
      (3, 'Ekran 3', '3')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO settings (key, value) VALUES
      ('timezone', 'Europe/Berlin'),
      ('brand_name', 'Pastera'),
      ('default_image_duration', '10')
    ON CONFLICT (key) DO NOTHING;
  `);
}

/** İçerik değiştiğinde sürüm numarasını artır */
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

/** Mevcut içerik sürümünü getir */
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
