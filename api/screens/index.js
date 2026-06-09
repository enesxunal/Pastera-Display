const { setCors, handleOptions } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { getSupabase, err } = require('../_lib/supabase');

const TIMEOUT = 2 * 60 * 1000;

module.exports = requireAuth(async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const sb = getSupabase();
  const { data: screens, error: sErr } = await sb.from('screens').select('*').order('id');
  err(sErr);
  const { data: heartbeats, error: hErr } = await sb.from('screen_heartbeats').select('*');
  err(hErr);

  const now = Date.now();
  const result = (screens || []).map((screen) => {
    const hb = (heartbeats || []).find((h) => h.screen_id === screen.id);
    const lastSeen = hb ? new Date(hb.last_seen).getTime() : 0;
    return {
      ...screen,
      isOnline: lastSeen > 0 && now - lastSeen < TIMEOUT,
      lastSeen: hb?.last_seen || null,
      displayMode: hb?.display_mode || null,
    };
  });

  return res.json(result);
});
