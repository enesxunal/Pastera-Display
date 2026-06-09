const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

let client = null;

function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase env eksik');
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws },
    });
  }
  return client;
}

function err(error) {
  if (error) throw new Error(error.message);
}

function attachMedia(item, mediaMap) {
  const m = mediaMap[item.media_id] || {};
  return {
    ...item,
    url: m.url || null,
    media_type: m.media_type || null,
    original_name: m.original_name || null,
    mime_type: m.mime_type || null,
  };
}

/** Playlist + medya bilgisi (join yerine ayrı sorgu — FK gerekmez) */
async function fetchPlaylistWithMedia(screenId) {
  const sb = getSupabase();
  const { data: items, error: iErr } = await sb
    .from('playlist_items')
    .select('*')
    .eq('screen_id', screenId)
    .order('sort_order')
    .order('id');
  err(iErr);
  if (!items?.length) return [];

  const ids = [...new Set(items.map((i) => i.media_id))];
  const { data: mediaRows, error: mErr } = await sb.from('media').select('*').in('id', ids);
  err(mErr);

  const map = Object.fromEntries((mediaRows || []).map((m) => [m.id, m]));
  return items.map((item) => attachMedia(item, map));
}

async function fetchPlaylistItemWithMedia(itemId) {
  const sb = getSupabase();
  const { data: item, error } = await sb.from('playlist_items').select('*').eq('id', itemId).maybeSingle();
  err(error);
  if (!item) return null;
  const { data: m } = await sb.from('media').select('*').eq('id', item.media_id).maybeSingle();
  return attachMedia(item, { [item.media_id]: m });
}

module.exports = { getSupabase, err, fetchPlaylistWithMedia, fetchPlaylistItemWithMedia };
