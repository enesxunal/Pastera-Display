-- Pastera Display — Supabase SQL Editor'de BİR KEZ çalıştır
-- supabase.com → projen → SQL Editor → New query → Run

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
  media_id INTEGER NOT NULL REFERENCES media(id),
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
  id INTEGER PRIMARY KEY DEFAULT 1,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO content_version (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO branches (id, name, slug) VALUES (1, 'Pastera', 'pastera') ON CONFLICT (id) DO NOTHING;
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

-- Varsayılan admin: admin / pastera123 (bcrypt hash)
INSERT INTO admin_users (username, password_hash) VALUES
  ('admin', '$2a$10$YoRg2xvplevBoZbHcnPsuOaHcWgUXvL7PMsO8RezdFPu37rn9gU2.')
ON CONFLICT (username) DO NOTHING;
