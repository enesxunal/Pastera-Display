const express = require('express');
const { getDb, getDbType, bumpContentVersion, getContentVersion } = require('../db');
const sb = require('../db/supabase');
const { authMiddleware } = require('../middleware/auth');
const { buildPlaylistResponse } = require('../services/scheduler');
const config = require('../config');

const router = express.Router();

const PLAYLIST_QUERY = `
  SELECT pi.*, m.url, m.media_type, m.original_name, m.mime_type
  FROM playlist_items pi JOIN media m ON m.id = pi.media_id
  WHERE pi.screen_id = ? ORDER BY pi.sort_order ASC, pi.id ASC
`;

router.get('/', authMiddleware, async (req, res) => {
  try {
    const now = Date.now();
    let screens, heartbeats;

    if (getDbType() === 'supabase') {
      screens = await sb.listScreens();
      heartbeats = await sb.listHeartbeats();
    } else {
      const db = getDb();
      screens = await db.all('SELECT * FROM screens ORDER BY id');
      heartbeats = await db.all('SELECT * FROM screen_heartbeats');
    }

    res.json(
      screens.map((screen) => {
        const hb = heartbeats.find((h) => h.screen_id === screen.id);
        const lastSeen = hb ? new Date(hb.last_seen).getTime() : 0;
        return {
          ...screen,
          isOnline: lastSeen > 0 && now - lastSeen < config.heartbeatTimeoutMs,
          lastSeen: hb?.last_seen || null,
          displayMode: hb?.display_mode || null,
        };
      })
    );
  } catch (err) {
    res.status(500).json({ error: 'Ekranlar listelenemedi' });
  }
});

router.get('/content-version/check', async (req, res) => {
  try {
    const version = await getContentVersion();
    res.json({ version, pollInterval: config.pollIntervalMs });
  } catch (err) {
    res.status(500).json({ error: 'Sürüm kontrol edilemedi' });
  }
});

router.get('/:id/playlist', async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    if (![1, 2, 3].includes(screenId)) return res.status(404).json({ error: 'Ekran bulunamadı' });

    let timezone, items;
    if (getDbType() === 'supabase') {
      timezone = (await sb.getSetting('timezone')) || config.timezone;
      items = await sb.listPlaylistItems(screenId);
    } else {
      const db = getDb();
      const tz = await db.get("SELECT value FROM settings WHERE key = 'timezone'");
      timezone = tz?.value || config.timezone;
      items = await db.all(PLAYLIST_QUERY, [screenId]);
    }

    res.json({
      screenId,
      timezone,
      version: await getContentVersion(),
      playlist: buildPlaylistResponse(items, timezone),
      pollInterval: config.pollIntervalMs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Oynatma listesi alınamadı' });
  }
});

router.post('/:id/heartbeat', async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    if (![1, 2, 3].includes(screenId)) return res.status(404).json({ error: 'Ekran bulunamadı' });

    const displayMode = req.body.displayMode || 'single';
    const userAgent = req.headers['user-agent'] || '';

    if (getDbType() === 'supabase') {
      await sb.upsertHeartbeat(screenId, userAgent, displayMode);
    } else {
      const db = getDb();
      await db.run(
        `INSERT INTO screen_heartbeats (screen_id, last_seen, user_agent, display_mode) VALUES (?, datetime('now'), ?, ?)
         ON CONFLICT(screen_id) DO UPDATE SET last_seen=datetime('now'), user_agent=?, display_mode=?`,
        [screenId, userAgent, displayMode, userAgent, displayMode]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Sinyal gönderilemedi' });
  }
});

router.get('/:id/playlist-items', authMiddleware, async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    const items =
      getDbType() === 'supabase'
        ? await sb.listPlaylistItems(screenId)
        : await getDb().all(PLAYLIST_QUERY, [screenId]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Playlist alınamadı' });
  }
});

router.post('/:id/playlist-items', authMiddleware, async (req, res) => {
  try {
    const screenId = parseInt(req.params.id, 10);
    const { mediaId, sortOrder = 0, displayDuration = 10, startTime = null, endTime = null, isDefault = false } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'Medya seçilmedi' });

    let item;
    if (getDbType() === 'supabase') {
      item = await sb.insertPlaylistItem({
        screen_id: screenId,
        media_id: mediaId,
        sort_order: sortOrder,
        display_duration: displayDuration,
        start_time: startTime,
        end_time: endTime,
        is_default: isDefault,
      });
    } else {
      const db = getDb();
      const result = await db.run(
        `INSERT INTO playlist_items (screen_id, media_id, sort_order, display_duration, start_time, end_time, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [screenId, mediaId, sortOrder, displayDuration, startTime, endTime, isDefault ? 1 : 0]
      );
      item = await db.get(
        `SELECT pi.*, m.url, m.media_type, m.original_name FROM playlist_items pi JOIN media m ON m.id=pi.media_id WHERE pi.id=?`,
        [result.lastInsertRowid]
      );
    }

    await bumpContentVersion();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Medya eklenemedi' });
  }
});

router.put('/playlist-items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { sortOrder, displayDuration, startTime, endTime, isDefault, isActive } = req.body;

    if (getDbType() === 'supabase') {
      const existing = await sb.getPlaylistItem(req.params.itemId);
      if (!existing) return res.status(404).json({ error: 'Öğe bulunamadı' });
      const item = await sb.updatePlaylistItem(req.params.itemId, {
        sort_order: sortOrder ?? existing.sort_order,
        display_duration: displayDuration ?? existing.display_duration,
        start_time: startTime !== undefined ? startTime : existing.start_time,
        end_time: endTime !== undefined ? endTime : existing.end_time,
        is_default: isDefault !== undefined ? isDefault : existing.is_default,
        is_active: isActive !== undefined ? isActive : existing.is_active,
      });
      await bumpContentVersion();
      return res.json(item);
    }

    const db = getDb();
    const existing = await db.get('SELECT * FROM playlist_items WHERE id = ?', [req.params.itemId]);
    if (!existing) return res.status(404).json({ error: 'Öğe bulunamadı' });
    await db.run(
      `UPDATE playlist_items SET sort_order=COALESCE(?,sort_order), display_duration=COALESCE(?,display_duration),
       start_time=?, end_time=?, is_default=COALESCE(?,is_default), is_active=COALESCE(?,is_active) WHERE id=?`,
      [sortOrder ?? existing.sort_order, displayDuration ?? existing.display_duration,
        startTime !== undefined ? startTime : existing.start_time,
        endTime !== undefined ? endTime : existing.end_time,
        isDefault !== undefined ? (isDefault ? 1 : 0) : existing.is_default,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        req.params.itemId]
    );
    await bumpContentVersion();
    const item = await db.get(
      `SELECT pi.*, m.url, m.media_type, m.original_name FROM playlist_items pi JOIN media m ON m.id=pi.media_id WHERE pi.id=?`,
      [req.params.itemId]
    );
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Güncellenemedi' });
  }
});

router.delete('/playlist-items/:itemId', authMiddleware, async (req, res) => {
  try {
    if (getDbType() === 'supabase') await sb.deletePlaylistItem(req.params.itemId);
    else await getDb().run('DELETE FROM playlist_items WHERE id = ?', [req.params.itemId]);
    await bumpContentVersion();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Silinemedi' });
  }
});

router.put('/:id/reorder', authMiddleware, async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Geçersiz sıralama' });

    if (getDbType() === 'supabase') await sb.updatePlaylistOrder(itemIds);
    else {
      const db = getDb();
      for (let i = 0; i < itemIds.length; i++) {
        await db.run('UPDATE playlist_items SET sort_order = ? WHERE id = ?', [i, itemIds[i]]);
      }
    }
    await bumpContentVersion();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Sıralama güncellenemedi' });
  }
});

module.exports = router;
