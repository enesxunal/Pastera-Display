const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let client = null;

function getSupabase() {
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
    }
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

function throwIfError(error) {
  if (error) throw new Error(error.message);
}

/** Admin */
async function getAdminByUsername(username) {
  const { data, error } = await getSupabase()
    .from('admin_users')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  throwIfError(error);
  return data;
}

async function createAdmin(username, passwordHash) {
  const { data, error } = await getSupabase()
    .from('admin_users')
    .insert({ username, password_hash: passwordHash })
    .select()
    .single();
  throwIfError(error);
  return data;
}

/** Medya */
async function listMedia() {
  const { data, error } = await getSupabase()
    .from('media')
    .select('*')
    .order('created_at', { ascending: false });
  throwIfError(error);
  return data || [];
}

async function getMedia(id) {
  const { data, error } = await getSupabase().from('media').select('*').eq('id', id).maybeSingle();
  throwIfError(error);
  return data;
}

async function insertMedia(row) {
  const { data, error } = await getSupabase().from('media').insert(row).select().single();
  throwIfError(error);
  return data;
}

async function deleteMedia(id) {
  const { error } = await getSupabase().from('media').delete().eq('id', id);
  throwIfError(error);
}

async function deletePlaylistByMediaId(mediaId) {
  const { error } = await getSupabase().from('playlist_items').delete().eq('media_id', mediaId);
  throwIfError(error);
}

/** Ekranlar */
async function listScreens() {
  const { data, error } = await getSupabase().from('screens').select('*').order('id');
  throwIfError(error);
  return data || [];
}

async function listHeartbeats() {
  const { data, error } = await getSupabase().from('screen_heartbeats').select('*');
  throwIfError(error);
  return data || [];
}

async function upsertHeartbeat(screenId, userAgent, displayMode) {
  const { error } = await getSupabase().from('screen_heartbeats').upsert({
    screen_id: screenId,
    last_seen: new Date().toISOString(),
    user_agent: userAgent,
    display_mode: displayMode,
  });
  throwIfError(error);
}

async function getSetting(key) {
  const { data, error } = await getSupabase().from('settings').select('value').eq('key', key).maybeSingle();
  throwIfError(error);
  return data?.value;
}

/** Playlist */
async function listPlaylistItems(screenId) {
  const { data, error } = await getSupabase()
    .from('playlist_items')
    .select('*, media(url, media_type, original_name, mime_type)')
    .eq('screen_id', screenId)
    .order('sort_order')
    .order('id');
  throwIfError(error);
  return (data || []).map(flattenPlaylistItem);
}

function flattenPlaylistItem(row) {
  const m = row.media || {};
  return {
    ...row,
    url: m.url,
    media_type: m.media_type,
    original_name: m.original_name,
    mime_type: m.mime_type,
    media: undefined,
  };
}

async function getPlaylistItem(id) {
  const { data, error } = await getSupabase()
    .from('playlist_items')
    .select('*, media(url, media_type, original_name)')
    .eq('id', id)
    .maybeSingle();
  throwIfError(error);
  return data ? flattenPlaylistItem(data) : null;
}

async function insertPlaylistItem(row) {
  const { data, error } = await getSupabase().from('playlist_items').insert(row).select().single();
  throwIfError(error);
  return getPlaylistItem(data.id);
}

async function updatePlaylistItem(id, updates) {
  const { error } = await getSupabase().from('playlist_items').update(updates).eq('id', id);
  throwIfError(error);
  return getPlaylistItem(id);
}

async function deletePlaylistItem(id) {
  const { error } = await getSupabase().from('playlist_items').delete().eq('id', id);
  throwIfError(error);
}

async function updatePlaylistOrder(itemIds) {
  for (let i = 0; i < itemIds.length; i++) {
    const { error } = await getSupabase().from('playlist_items').update({ sort_order: i }).eq('id', itemIds[i]);
    throwIfError(error);
  }
}

/** İçerik sürümü */
async function getContentVersion() {
  const { data, error } = await getSupabase().from('content_version').select('version').eq('id', 1).maybeSingle();
  throwIfError(error);
  return data ? Number(data.version) : 1;
}

async function bumpContentVersion() {
  const v = await getContentVersion();
  const { error } = await getSupabase()
    .from('content_version')
    .update({ version: v + 1, updated_at: new Date().toISOString() })
    .eq('id', 1);
  throwIfError(error);
}

module.exports = {
  getSupabase,
  getAdminByUsername,
  createAdmin,
  listMedia,
  getMedia,
  insertMedia,
  deleteMedia,
  deletePlaylistByMediaId,
  listScreens,
  listHeartbeats,
  upsertHeartbeat,
  getSetting,
  listPlaylistItems,
  getPlaylistItem,
  insertPlaylistItem,
  updatePlaylistItem,
  deletePlaylistItem,
  updatePlaylistOrder,
  getContentVersion,
  bumpContentVersion,
};
