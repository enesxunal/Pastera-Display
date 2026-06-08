/**
 * Sağlık kontrolü — hafif endpoint
 */
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

module.exports = async (req, res) => {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(503).json({ status: 'error', message: 'Supabase env eksik' });
    }
    const sb = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { transport: ws },
    });
    const { error } = await sb.from('screens').select('id').limit(1);
    if (error) return res.status(503).json({ status: 'error', message: error.message });
    return res.json({ status: 'ok', service: 'Pastera Display' });
  } catch (err) {
    return res.status(503).json({ status: 'error', message: err.message });
  }
};
