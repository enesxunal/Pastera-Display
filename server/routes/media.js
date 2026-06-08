const express = require('express');
const multer = require('multer');
const { getDb, bumpContentVersion } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { saveFile, deleteFile } = require('../services/storage');

const router = express.Router();

// Bellekte dosya tut (Vercel Blob ve yerel disk için)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece JPG, PNG ve MP4 dosyaları yüklenebilir'));
    }
  },
});

/**
 * GET /api/media
 * Tüm medya dosyalarını listele
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const items = await db.all('SELECT * FROM media ORDER BY created_at DESC');
    res.json(items);
  } catch (err) {
    console.error('Medya listesi hatası:', err);
    res.status(500).json({ error: 'Medya listelenemedi' });
  }
});

/**
 * POST /api/media/upload
 * Yeni medya yükle
 */
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya seçilmedi' });
    }

    const saved = await saveFile(req.file);
    const db = getDb();

    const result = await db.run(
      `INSERT INTO media (filename, original_name, mime_type, media_type, url, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        saved.filename,
        req.file.originalname,
        req.file.mimetype,
        saved.mediaType,
        saved.url,
        saved.fileSize,
      ]
    );

    const media = await db.get('SELECT * FROM media WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(media);
  } catch (err) {
    console.error('Yükleme hatası:', err);
    res.status(400).json({ error: err.message || 'Dosya yüklenemedi' });
  }
});

/**
 * DELETE /api/media/:id
 * Medyayı sil
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const media = await db.get('SELECT * FROM media WHERE id = ?', [req.params.id]);

    if (!media) {
      return res.status(404).json({ error: 'Medya bulunamadı' });
    }

    // Playlist'ten kaldır
    await db.run('DELETE FROM playlist_items WHERE media_id = ?', [media.id]);
    await deleteFile(media.filename, media.url);
    await db.run('DELETE FROM media WHERE id = ?', [media.id]);
    await bumpContentVersion();

    res.json({ success: true });
  } catch (err) {
    console.error('Silme hatası:', err);
    res.status(500).json({ error: 'Medya silinemedi' });
  }
});

module.exports = router;
