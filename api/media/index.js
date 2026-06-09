const { setCors, handleOptions } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { getSupabase, err } = require('../_lib/supabase');

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const { data, error } = await getSupabase().from('media').select('*').order('created_at', { ascending: false });
  err(error);
  return res.json(data || []);
});
