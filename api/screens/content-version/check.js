const { setCors, handleOptions } = require('../../_lib/cors');
const { getSupabase } = require('../../_lib/supabase');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const { data } = await getSupabase().from('content_version').select('version').eq('id', 1).maybeSingle();
  return res.json({ version: data?.version || 1, pollInterval: 5000 });
};
