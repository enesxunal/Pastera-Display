-- Pastera Digital Signage veritabanı şeması

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT DEFAULT 'Europe/Berlin',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS screens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  branch_id INTEGER DEFAULT 1,
  default_media_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  display_duration INTEGER DEFAULT 10,
  start_time TEXT,
  end_time TEXT,
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (screen_id) REFERENCES screens(id),
  FOREIGN KEY (media_id) REFERENCES media(id)
);

CREATE TABLE IF NOT EXISTS screen_heartbeats (
  screen_id INTEGER PRIMARY KEY,
  last_seen TEXT NOT NULL,
  user_agent TEXT,
  display_mode TEXT DEFAULT 'single',
  FOREIGN KEY (screen_id) REFERENCES screens(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- İçerik değişikliği sürümü (ekranlar polling ile kontrol eder)
CREATE TABLE IF NOT EXISTS content_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO content_version (id, version) VALUES (1, 1);

INSERT OR IGNORE INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera');

INSERT OR IGNORE INTO screens (id, name, slug) VALUES
  (1, 'Ekran 1', '1'),
  (2, 'Ekran 2', '2'),
  (3, 'Ekran 3', '3');

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('timezone', 'Europe/Berlin'),
  ('brand_name', 'Pastera'),
  ('default_image_duration', '10');
