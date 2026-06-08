const express = require('express');
const { getDb, bumpContentVersion, getContentVersion } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { buildPlaylistResponse } = require('../services/scheduler');
const config = require('../config');

const router = express.Router();

/** Playlist sorgusu - media ile join */
const PLAYLIST_QUERY = `
  SELECT pi.*, m.url, m.media_type, m.original_name, m.mime_type
  FROM playlist_items pi
  JOIN media m ON m.id = pi.media_id
  WHERE pi.screen_id = ?
  ORDER BY pi.sort_order ASC, pi.id ASC
`;

/**
 * GET /api/screens
 * Tüm ekranları ve çevrimiçi durumlarını listele (admin)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const screens = await db.all('SELECT * FROM screens ORDER BY id');
    const heartbeats = await db.all('SELECT * FROM screen_heartbeats');
    const now = Date.now();

    const result = screens.map((screen) => {
      const hb = heartbeats.find((h) => h.screen_id === screen.id);
      const lastSeen = hb ? new Date(hb.last_seen).getTime() : 0;
      const isOnline = lastSeen > 0 && now - lastSeen < config.heartbeatTimeoutMs;

      return {
        ...screen,
        isOnline,
        lastSeen: hb?.last_seen || null,
        displayMode: hb?.display_mode || null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Ekran listesi hatası:', err);
    res.status(500).json({ error: 'Ekranlar listelenemedi' });
  }
});

/**
 * GET /api/screens/content-version/check
 * İçerik sürüm kontrolü (polling için) — :id rotasından önce tanımlanmalı
 */
router.get('/content-version/check', async (req, res) => {
  try {
    const version = await getContentVersion();
    res.json({ version, pollInterval: config.pollIntervalMs });
  } catch (err) {
    res.status(500).json({ error: 'Sürüm kontrol edilemedi' });
  }
});

/**
 * GET /api/screens/:id/playlist
 * Ekran için aktif oynatma listesi (herkese açık - ekran client'ı kullanır)
 */
router.get('/:id/playlist', async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    if (![1, 2, 3].includes(screenId)) {
      return res.status(404).json({ error: 'Ekran bulunamadı' });
    }

    const db = getDb();
    const timezoneRow = await db.get("SELECT value FROM settings WHERE key = 'timezone'");
    const timezone = timezoneRow?.value || config.timezone;

    const items = await db.all(PLAYLIST_QUERY, [screenId]);
    const playlist = buildPlaylistResponse(items, timezone);
    const version = await getContentVersion();

    res.json({
      screenId,
      timezone,
      version,
      playlist,
      pollInterval: config.pollIntervalMs,
    });
  } catch (err) {
    console.error('Playlist hatası:', err);
    res.status(500).json({ error: 'Oynatma listesi alınamadı' });
  }
});

/**
 * POST /api/screens/:id/heartbeat
 * Ekrandan canlılık sinyali (çevrimiçi durumu için)
 */
router.post('/:id/heartbeat', async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    if (![1, 2, 3].includes(screenId)) {
      return res.status(404).json({ error: 'Ekran bulunamadı' });
    }

    const db = getDb();
    const { displayMode = 'single' } = req.body;
    const userAgent = req.headers['user-agent'] || '';

    if (db.type === 'postgres') {
      await db.run(
        `INSERT INTO screen_heartbeats (screen_id, last_seen, user_agent, display_mode)
         VALUES (?, NOW(), ?, ?)
         ON CONFLICT (screen_id) DO UPDATE SET
           last_seen = NOW(), user_agent = ?, display_mode = ?`,
        [screenId, userAgent, displayMode, userAgent, displayMode]
      );
    } else {
      await db.run(
        `INSERT INTO screen_heartbeats (screen_id, last_seen, user_agent, display_mode)
         VALUES (?, datetime('now'), ?, ?)
         ON CONFLICT(screen_id) DO UPDATE SET
           last_seen = datetime('now'), user_agent = ?, display_mode = ?`,
        [screenId, userAgent, displayMode, userAgent, displayMode]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Heartbeat hatası:', err);
    res.status(500).json({ error: 'Sinyal gönderilemedi' });
  }
});

/**
 * GET /api/screens/:id/playlist-items
 * Ekranın tüm playlist öğeleri (admin)
 */
router.get('/:id/playlist-items', authMiddleware, async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    const db = getDb();
    const items = await db.all(PLAYLIST_QUERY, [screenId]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Playlist alınamadı' });
  }
});

/**
 * POST /api/screens/:id/playlist-items
 * Ekrana medya ekle
 */
router.post('/:id/playlist-items', authMiddleware, async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    const {
      mediaId,
      sortOrder = 0,
      displayDuration = 10,
      startTime = null,
      endTime = null,
      isDefault = false,
    } = req.body;

    if (!mediaId) {
      return res.status(400).json({ error: 'Medya seçilmedi' });
    }

    const db = getDb();
    const result = await db.run(
      `INSERT INTO playlist_items
       (screen_id, media_id, sort_order, display_duration, start_time, end_time, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        screenId,
        mediaId,
        sortOrder,
        displayDuration,
        startTime || null,
        endTime || null,
        isDefault ? 1 : 0,
      ]
    );

    await bumpContentVersion();
    const item = await db.get(
      `SELECT pi.*, m.url, m.media_type, m.original_name
       FROM playlist_items pi JOIN media m ON m.id = pi.media_id
       WHERE pi.id = ?`,
      [result.lastInsertRowid]
    );

    res.status(201).json(item);
  } catch (err) {
    console.error('Playlist ekleme hatası:', err);
    res.status(500).json({ error: 'Medya eklenemedi' });
  }
});

/**
 * PUT /api/screens/playlist-items/:itemId
 * Playlist öğesini güncelle
 */
router.put('/playlist-items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { sortOrder, displayDuration, startTime, endTime, isDefault, isActive } = req.body;
    const db = getDb();

    const existing = await db.get('SELECT * FROM playlist_items WHERE id = ?', [req.params.itemId]);
    if (!existing) {
      return res.status(404).json({ error: 'Öğe bulunamadı' });
    }

    await db.run(
      `UPDATE playlist_items SET
        sort_order = COALESCE(?, sort_order),
        display_duration = COALESCE(?, display_duration),
        start_time = ?,
        end_time = ?,
        is_default = COALESCE(?, is_default),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        sortOrder ?? existing.sort_order,
        displayDuration ?? existing.display_duration,
        startTime !== undefined ? startTime : existing.start_time,
        endTime !== undefined ? endTime : existing.end_time,
        isDefault !== undefined ? (isDefault ? 1 : 0) : existing.is_default,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        req.params.itemId,
      ]
    );

    await bumpContentVersion();
    const item = await db.get(
      `SELECT pi.*, m.url, m.media_type, m.original_name
       FROM playlist_items pi JOIN media m ON m.id = pi.media_id
       WHERE pi.id = ?`,
      [req.params.itemId]
    );

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Güncellenemedi' });
  }
});

/**
 * DELETE /api/screens/playlist-items/:itemId
 */
router.delete('/playlist-items/:itemId', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM playlist_items WHERE id = ?', [req.params.itemId]);
    await bumpContentVersion();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Silinemedi' });
  }
});

/**
 * PUT /api/screens/:id/reorder
 * Playlist sıralamasını güncelle
 */
router.put('/:id/reorder', authMiddleware, async (req, res) => {
  try {
    const { itemIds } = req.body; // sıralı id listesi
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'Geçersiz sıralama' });
    }

    const db = getDb();
    for (let i = 0; i < itemIds.length; i++) {
      await db.run('UPDATE playlist_items SET sort_order = ? WHERE id = ?', [i, itemIds[i]]);
    }

    await bumpContentVersion();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Sıralama güncellenemedi' });
  }
});

module.exports = router;
