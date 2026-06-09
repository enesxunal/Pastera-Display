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

  const itemId = req.query.itemId;
  const sb = getSupabase();

  if (req.method === 'PUT') {
    const body = await readBody(req);
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

    const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
    await sb.from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);

    const { data: full, error: fErr } = await sb
      .from('playlist_items')
      .select('*, media(url, media_type, original_name)')
      .eq('id', itemId)
      .single();
    err(fErr);
    return res.json(flatPlaylist(full));
  }

  if (req.method === 'DELETE') {
    const { error } = await sb.from('playlist_items').delete().eq('id', itemId);
    err(error);
    const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
    await sb.from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'PUT veya DELETE' });
});
