const { setCors, handleOptions } = require('../../_lib/cors');
const { getSupabase, err } = require('../../_lib/supabase');

async function readBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });

  const screenId = parseInt(req.query.id, 10);
  if (![1, 2, 3].includes(screenId)) return res.status(404).json({ error: 'Ekran bulunamadı' });

  const body = await readBody(req);
  const { error } = await getSupabase().from('screen_heartbeats').upsert({
    screen_id: screenId,
    last_seen: new Date().toISOString(),
    user_agent: req.headers['user-agent'] || '',
    display_mode: body.displayMode || 'single',
  });
  err(error);
  return res.json({ ok: true });
};
