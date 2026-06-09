const { setCors, handleOptions } = require('../../_lib/cors');
const { requireAuth } = require('../../_lib/auth');
const { getSupabase, err, flatPlaylist } = require('../../_lib/supabase');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;

  const screenId = parseInt(req.query.id, 10);
  const sb = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('playlist_items')
      .select('*, media(url, media_type, original_name, mime_type)')
      .eq('screen_id', screenId)
      .order('sort_order')
      .order('id');
    err(error);
    return res.json((data || []).map(flatPlaylist));
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const { mediaId, sortOrder = 0, displayDuration = 10, startTime = null, endTime = null, isDefault = false } = body;
    if (!mediaId) return res.status(400).json({ error: 'Medya seçilmedi' });

    const { data, error } = await sb
      .from('playlist_items')
      .insert({
        screen_id: screenId,
        media_id: mediaId,
        sort_order: sortOrder,
        display_duration: displayDuration,
        start_time: startTime,
        end_time: endTime,
        is_default: isDefault,
      })
      .select()
      .single();
    err(error);

    const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
    await sb.from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);

    const { data: full, error: fErr } = await sb
      .from('playlist_items')
      .select('*, media(url, media_type, original_name)')
      .eq('id', data.id)
      .single();
    err(fErr);
    return res.status(201).json(flatPlaylist(full));
  }

  return res.status(405).json({ error: 'GET veya POST' });
});
