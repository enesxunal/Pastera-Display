const { del } = require('@vercel/blob');
const { setCors, handleOptions } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { getSupabase, err } = require('../_lib/supabase');

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'DELETE gerekli' });

  const id = req.query.id;
  const { data: media, error: getErr } = await getSupabase().from('media').select('*').eq('id', id).maybeSingle();
  err(getErr);
  if (!media) return res.status(404).json({ error: 'Medya bulunamadı' });

  await getSupabase().from('playlist_items').delete().eq('media_id', id);

  if (media.url?.includes('blob.vercel-storage.com') && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await del(media.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (e) {
      console.warn('Blob silinemedi:', e.message);
    }
  }

  const { error } = await getSupabase().from('media').delete().eq('id', id);
  err(error);

  const { data: ver } = await getSupabase().from('content_version').select('version').eq('id', 1).maybeSingle();
  await getSupabase().from('content_version').update({ version: (ver?.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', 1);

  return res.json({ success: true });
});
