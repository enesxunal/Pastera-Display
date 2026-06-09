const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Busboy = require('busboy');
const path = require('path');
const { put, del } = require('@vercel/blob');
const { getSupabase, err, fetchPlaylistWithMedia, fetchPlaylistItemWithMedia } = require('./supabase');
const { verifyToken } = require('./auth');

const JWT_SECRET = () => process.env.JWT_SECRET || 'pastera-dev-secret';
const TIMEOUT = 2 * 60 * 1000;

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let filename = 'upload';
    let mimeType = 'application/octet-stream';
    busboy.on('file', (n, stream, info) => {
      filename = info.filename || filename;
      mimeType = info.mimeType || mimeType;
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });
    busboy.on('finish', () => {
      if (!fileBuffer) return reject(new Error('Dosya seçilmedi'));
      resolve({ buffer: fileBuffer, filename, mimeType });
    });
    busboy.on('error', reject);
    if (req.body && Buffer.isBuffer(req.body)) busboy.end(req.body);
    else if (typeof req.pipe === 'function') req.pipe(busboy);
    else reject(new Error('Dosya okunamadı'));
  });
}

function getActivePlaylist(items, timezone) {
  const fmt = new Intl.DateTimeFormat('de-DE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(new Date());
  const current = parseInt(parts.find((p) => p.type === 'hour')?.value || '0') * 60 +
    parseInt(parts.find((p) => p.type === 'minute')?.value || '0');
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const inRange = (s, e) => {
    if (s === null && e === null) return true;
    const a = s ?? 0, b = e ?? 1440;
    if (a <= b) return current >= a && current < b;
    return current >= a || current < b;
  };
  const active = items.filter((i) => !i.is_default && i.is_active !== false && inRange(toMin(i.start_time), toMin(i.end_time)));
  if (active.length) return active.sort((a, b) => a.sort_order - b.sort_order);
  const defs = items.filter((i) => i.is_default);
  if (defs.length) return defs.sort((a, b) => a.sort_order - b.sort_order);
  return items.filter((i) => i.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
}

async function bumpVersion(sb) {
  const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
  await sb.from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);
}

const PUBLIC = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/screens/content-version/check' },
  { method: 'GET', pattern: /^\/api\/screens\/[123]\/playlist$/ },
  { method: 'POST', pattern: /^\/api\/screens\/[123]\/heartbeat$/ },
];

function isPublic(method, path) {
  return PUBLIC.some((r) => {
    if (r.method !== method) return false;
    if (r.path) return r.path === path;
    return r.pattern.test(path);
  });
}

/** Tüm API rotaları — tek serverless function */
async function handleRequest(req, res, urlPath) {
  const method = req.method;
  const sb = getSupabase();

  if (!isPublic(method, urlPath)) {
    try { verifyToken(req); } catch { return res.status(401).json({ error: 'Giriş gerekli' }); }
  }

  // POST /api/auth/login
  if (urlPath === '/api/auth/login' && method === 'POST') {
    const { username, password } = await readJson(req);
    if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    const { data: user, error } = await sb.from('admin_users').select('*').eq('username', username).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET(), { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, username: user.username } });
  }

  // GET /api/auth/me
  if (urlPath === '/api/auth/me' && method === 'GET') {
    try {
      const decoded = verifyToken(req);
      return res.json({ user: { id: decoded.id, username: decoded.username } });
    } catch {
      return res.status(401).json({ error: 'Giriş gerekli' });
    }
  }

  // GET /api/health
  if (urlPath === '/api/health' && method === 'GET') {
    const { error } = await sb.from('screens').select('id').limit(1);
    if (error) return res.status(503).json({ status: 'error', message: error.message });
    return res.json({ status: 'ok', service: 'Pastera Display' });
  }

  // GET /api/screens/content-version/check
  if (urlPath === '/api/screens/content-version/check' && method === 'GET') {
    const { data } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
    return res.json({ version: data?.version || 1, pollInterval: 5000 });
  }

  const playlistMatch = urlPath.match(/^\/api\/screens\/([123])\/playlist$/);
  if (playlistMatch && method === 'GET') {
    const screenId = parseInt(playlistMatch[1], 10);
    const { data: tzRow } = await sb.from('settings').select('value').eq('key', 'timezone').maybeSingle();
    const timezone = tzRow?.value || 'Europe/Berlin';
    const flat = await fetchPlaylistWithMedia(screenId);
    const active = getActivePlaylist(flat, timezone);
    const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
    return res.json({
      screenId, timezone, version: ver?.version || 1, pollInterval: 5000,
      playlist: active.map((i) => ({
        id: i.id, mediaId: i.media_id, url: i.url, mediaType: i.media_type,
        originalName: i.original_name, displayDuration: i.display_duration || 10,
        isDefault: !!i.is_default, startTime: i.start_time, endTime: i.end_time,
      })),
    });
  }

  const heartbeatMatch = urlPath.match(/^\/api\/screens\/([123])\/heartbeat$/);
  if (heartbeatMatch && method === 'POST') {
    const screenId = parseInt(heartbeatMatch[1], 10);
    const body = await readJson(req);
    const { error } = await sb.from('screen_heartbeats').upsert({
      screen_id: screenId, last_seen: new Date().toISOString(),
      user_agent: req.headers['user-agent'] || '', display_mode: body.displayMode || 'single',
    });
    err(error);
    return res.json({ ok: true });
  }

  // GET /api/media
  if (urlPath === '/api/media' && method === 'GET') {
    const { data, error } = await sb.from('media').select('*').order('created_at', { ascending: false });
    err(error);
    return res.json(data || []);
  }

  // POST /api/media/upload
  if (urlPath === '/api/media/upload' && method === 'POST') {
    const { buffer, filename, mimeType } = await parseUpload(req);
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4'];
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Sadece JPG, PNG ve MP4' });
    const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';
    const ext = path.extname(filename) || (mediaType === 'video' ? '.mp4' : '.jpg');
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: 'Blob bağlı değil' });
    const blob = await put(`media/${storedName}`, buffer, { access: 'public', token, contentType: mimeType });
    const { data, error } = await sb.from('media').insert({
      filename: storedName, original_name: filename, mime_type: mimeType,
      media_type: mediaType, url: blob.url, file_size: buffer.length,
    }).select().single();
    err(error);
    return res.status(201).json(data);
  }

  // DELETE /api/media/:id
  const mediaDel = urlPath.match(/^\/api\/media\/(\d+)$/);
  if (mediaDel && method === 'DELETE') {
    const id = mediaDel[1];
    const { data: media, error: gErr } = await sb.from('media').select('*').eq('id', id).maybeSingle();
    err(gErr);
    if (!media) return res.status(404).json({ error: 'Medya bulunamadı' });
    await sb.from('playlist_items').delete().eq('media_id', id);
    if (media.url?.includes('blob.vercel-storage.com') && process.env.BLOB_READ_WRITE_TOKEN) {
      try { await del(media.url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch {}
    }
    await sb.from('media').delete().eq('id', id);
    await bumpVersion(sb);
    return res.json({ success: true });
  }

  // GET /api/screens
  if (urlPath === '/api/screens' && method === 'GET') {
    const { data: screens, error: sErr } = await sb.from('screens').select('*').order('id');
    err(sErr);
    const { data: heartbeats, error: hErr } = await sb.from('screen_heartbeats').select('*');
    err(hErr);
    const now = Date.now();
    return res.json((screens || []).map((screen) => {
      const hb = (heartbeats || []).find((h) => h.screen_id === screen.id);
      const lastSeen = hb ? new Date(hb.last_seen).getTime() : 0;
      return { ...screen, isOnline: lastSeen > 0 && now - lastSeen < TIMEOUT, lastSeen: hb?.last_seen || null, displayMode: hb?.display_mode || null };
    }));
  }

  // GET/POST /api/screens/:id/playlist-items
  const plItems = urlPath.match(/^\/api\/screens\/(\d+)\/playlist-items$/);
  if (plItems) {
    const screenId = parseInt(plItems[1], 10);
    if (method === 'GET') {
      return res.json(await fetchPlaylistWithMedia(screenId));
    }
    if (method === 'POST') {
      const body = await readJson(req);
      if (!body.mediaId) return res.status(400).json({ error: 'Medya seçilmedi' });
      const { data, error } = await sb.from('playlist_items').insert({
        screen_id: screenId, media_id: body.mediaId, sort_order: body.sortOrder || 0,
        display_duration: body.displayDuration || 10, start_time: body.startTime || null,
        end_time: body.endTime || null, is_default: body.isDefault || false,
      }).select().single();
      err(error);
      await bumpVersion(sb);
      return res.status(201).json(await fetchPlaylistItemWithMedia(data.id));
    }
  }

  // PUT/DELETE /api/screens/playlist-items/:id
  const plItem = urlPath.match(/^\/api\/screens\/playlist-items\/(\d+)$/);
  if (plItem) {
    const itemId = plItem[1];
    if (method === 'PUT') {
      const body = await readJson(req);
      const { data: existing, error: eErr } = await sb.from('playlist_items').select('*').eq('id', itemId).maybeSingle();
      err(eErr);
      if (!existing) return res.status(404).json({ error: 'Öğe bulunamadı' });
      const { error } = await sb.from('playlist_items').update({
        sort_order: body.sortOrder ?? existing.sort_order,
        display_duration: body.displayDuration ?? existing.display_duration,
        start_time: body.startTime !== undefined ? body.startTime : existing.start_time,
        end_time: body.endTime !== undefined ? body.endTime : existing.end_time,
        is_default: body.isDefault !== undefined ? body.isDefault : existing.is_default,
        is_active: body.isActive !== undefined ? body.isActive : existing.is_active,
      }).eq('id', itemId);
      err(error);
      await bumpVersion(sb);
      return res.json(await fetchPlaylistItemWithMedia(itemId));
    }
    if (method === 'DELETE') {
      await sb.from('playlist_items').delete().eq('id', itemId);
      await bumpVersion(sb);
      return res.json({ success: true });
    }
  }

  // PUT /api/screens/:id/reorder
  const reorder = urlPath.match(/^\/api\/screens\/(\d+)\/reorder$/);
  if (reorder && method === 'PUT') {
    const { itemIds } = await readJson(req);
    if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Geçersiz sıralama' });
    for (let i = 0; i < itemIds.length; i++) {
      const { error } = await sb.from('playlist_items').update({ sort_order: i }).eq('id', itemIds[i]);
      err(error);
    }
    await bumpVersion(sb);
    return res.json({ success: true });
  }

  return res.status(404).json({ error: 'Endpoint bulunamadı' });
}

module.exports = { handleRequest };
