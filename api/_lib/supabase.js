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

function flatPlaylist(row) {
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

module.exports = { getSupabase, err, flatPlaylist };
