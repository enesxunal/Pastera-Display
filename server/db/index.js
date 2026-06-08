const fs = require('fs');
const path = require('path');
const config = require('../config');

let ready = false;

/** Anında başlar — tablo oluşturma YOK (Supabase SQL Editor'de bir kez yapılır) */
async function initDatabase() {
  if (ready) return;

  if (config.useSupabase && config.isVercel) {
    require('./supabase').getSupabase();
    ready = true;
    return { type: 'supabase' };
  }

  if (config.isVercel) {
    throw new Error('SUPABASE_URL bulunamadı. Vercel Storage → Supabase → Connect to Project');
  }

  // Yerel geliştirme: SQLite
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '../../data/pastera.db');
  if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  global.__sqlite = sqlite;
  ready = true;
  return { type: 'sqlite' };
}

function getDb() {
  if (!ready) throw new Error('Veritabanı başlatılmadı');
  if (config.useSupabase && config.isVercel) return { type: 'supabase' };
  return createSqliteAdapter(global.__sqlite);
}

function getDbType() {
  return config.useSupabase && config.isVercel ? 'supabase' : 'sqlite';
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

async function bumpContentVersion() {
  if (getDbType() === 'supabase') {
    return require('./supabase').bumpContentVersion();
  }
  const db = getDb();
  await db.run(`UPDATE content_version SET version = version + 1, updated_at = datetime('now') WHERE id = 1`);
}

async function getContentVersion() {
  if (getDbType() === 'supabase') {
    return require('./supabase').getContentVersion();
  }
  const row = await getDb().get('SELECT version FROM content_version WHERE id = 1');
  return row ? Number(row.version) : 1;
}

module.exports = { initDatabase, getDb, getDbType, bumpContentVersion, getContentVersion };
