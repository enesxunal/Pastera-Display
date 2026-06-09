-- Opsiyonel: tablolar arası ilişkiyi Supabase'e tanıt (SQL Editor'de çalıştır)
ALTER TABLE playlist_items
  DROP CONSTRAINT IF EXISTS playlist_items_media_id_fkey;

ALTER TABLE playlist_items
  ADD CONSTRAINT playlist_items_media_id_fkey
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE;
