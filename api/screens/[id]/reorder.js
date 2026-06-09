const { setCors, handleOptions } = require('../../_lib/cors');
const { requireAuth } = require('../../_lib/auth');
const { getSupabase, err } = require('../../_lib/supabase');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'PUT gerekli' });

  const { itemIds } = await readBody(req);
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'Geçersiz sıralama' });

  const sb = getSupabase();
  for (let i = 0; i < itemIds.length; i++) {
    const { error } = await sb.from('playlist_items').update({ sort_order: i }).eq('id', itemIds[i]);
    err(error);
  }

  const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();
  await sb.from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);

  return res.json({ success: true });
});
