const { setCors, handleOptions } = require('../../_lib/cors');
const { getSupabase, err, flatPlaylist } = require('../../_lib/supabase');

function getActiveItems(items, timezone) {
  const formatter = new Intl.DateTimeFormat('de-DE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = formatter.formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  const current = parseInt(hour) * 60 + parseInt(minute);

  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const inRange = (start, end) => {
    if (start === null && end === null) return true;
    const s = start ?? 0;
    const e = end ?? 24 * 60;
    if (s <= e) return current >= s && current < e;
    return current >= s || current < e;
  };

  const active = items.filter((item) => {
    if (item.is_default) return false;
    if (item.is_active === false) return false;
    return inRange(toMin(item.start_time), toMin(item.end_time));
  });

  if (active.length) return active.sort((a, b) => a.sort_order - b.sort_order);
  const defaults = items.filter((i) => i.is_default);
  if (defaults.length) return defaults.sort((a, b) => a.sort_order - b.sort_order);
  return items.filter((i) => i.is_active !== false).sort((a, b) => a.sort_order - b.sort_order);
}

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const screenId = parseInt(req.query.id, 10);
  if (![1, 2, 3].includes(screenId)) return res.status(404).json({ error: 'Ekran bulunamadı' });

  const sb = getSupabase();
  const { data: tzRow } = await sb.from('settings').select('value').eq('key', 'timezone').maybeSingle();
  const timezone = tzRow?.value || 'Europe/Berlin';

  const { data, error } = await sb
    .from('playlist_items')
    .select('*, media(url, media_type, original_name)')
    .eq('screen_id', screenId)
    .order('sort_order')
    .order('id');
  err(error);

  const flat = (data || []).map(flatPlaylist);
  const active = getActiveItems(flat, timezone);
  const { data: ver } = await sb.from('content_version').select('version').eq('id', 1).maybeSingle();

  return res.json({
    screenId,
    timezone,
    version: ver?.version || 1,
    pollInterval: 5000,
    playlist: active.map((item) => ({
      id: item.id,
      mediaId: item.media_id,
      url: item.url,
      mediaType: item.media_type,
      originalName: item.original_name,
      displayDuration: item.display_duration || 10,
      isDefault: !!item.is_default,
      startTime: item.start_time,
      endTime: item.end_time,
    })),
  });
};
