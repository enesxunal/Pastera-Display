const express = require('express');
const multer = require('multer');
const { getDb, getDbType, bumpContentVersion } = require('../db');
const sb = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { saveFile, deleteFile } = require('../services/storage');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = getDbType() === 'supabase' ? await sb.listMedia() : await getDb().all('SELECT * FROM media ORDER BY created_at DESC');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Medya listelenemedi' });
  }
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi' });
    const saved = await saveFile(req.file);

    if (getDbType() === 'supabase') {
      const media = await sb.insertMedia({
        filename: saved.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        media_type: saved.mediaType,
        url: saved.url,
        file_size: saved.fileSize,
      });
      return res.status(201).json(media);
    }

    const db = getDb();
    const result = await db.run(
      `INSERT INTO media (filename, original_name, mime_type, media_type, url, file_size) VALUES (?, ?, ?, ?, ?, ?)`,
      [saved.filename, req.file.originalname, req.file.mimetype, saved.mediaType, saved.url, saved.fileSize]
    );
    const media = await db.get('SELECT * FROM media WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(media);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Dosya yüklenemedi' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (getDbType() === 'supabase') {
      const media = await sb.getMedia(req.params.id);
      if (!media) return res.status(404).json({ error: 'Medya bulunamadı' });
      await sb.deletePlaylistByMediaId(media.id);
      await deleteFile(media.filename, media.url);
      await sb.deleteMedia(media.id);
      await bumpContentVersion();
      return res.json({ success: true });
    }

    const db = getDb();
    const media = await db.get('SELECT * FROM media WHERE id = ?', [req.params.id]);
    if (!media) return res.status(404).json({ error: 'Medya bulunamadı' });
    await db.run('DELETE FROM playlist_items WHERE media_id = ?', [media.id]);
    await deleteFile(media.filename, media.url);
    await db.run('DELETE FROM media WHERE id = ?', [media.id]);
    await bumpContentVersion();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Medya silinemedi' });
  }
});

module.exports = router;
