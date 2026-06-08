const config = require('../config');

/**
 * Almanya saat diliminde şu anki saati "HH:MM" formatında döndürür
 */
function getCurrentTimeInTimezone(timezone = config.timezone) {
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

/**
 * "HH:MM" stringini dakikaya çevir (gece yarısından itibaren)
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Verilen saat, başlangıç-bitiş aralığında mı?
 * Gece yarısını geçen aralıkları da destekler (örn: 22:00 - 06:00)
 */
function isTimeInRange(currentMinutes, startMinutes, endMinutes) {
  if (startMinutes === null || endMinutes === null) return true;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Gece yarısını geçen aralık
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Playlist öğelerinden şu an oynatılması gerekenleri filtrele
 * @param {Array} items - playlist_items listesi (media bilgisi join edilmiş)
 * @param {string} timezone - Saat dilimi
 */
function getActivePlaylistItems(items, timezone = config.timezone) {
  const currentTime = getCurrentTimeInTimezone(timezone);
  const currentMinutes = timeToMinutes(currentTime);

  // Saat aralığına uyan aktif öğeler
  const scheduled = items.filter((item) => {
    if (!item.is_active && item.is_active !== 1 && item.is_active !== true) return false;
    if (item.is_default || item.is_default === 1) return false;

    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);

    // Saat aralığı tanımlı değilse = 24 saat geçerli
    if (start === null && end === null) return true;

    return isTimeInRange(currentMinutes, start ?? 0, end ?? 24 * 60);
  });

  if (scheduled.length > 0) {
    return scheduled.sort((a, b) => a.sort_order - b.sort_order);
  }

  // Zamanlanmış içerik yoksa varsayılanları döndür
  const defaults = items.filter(
    (item) =>
      (item.is_default === 1 || item.is_default === true) &&
      (item.is_active === 1 || item.is_active === true || item.is_active === undefined)
  );

  if (defaults.length > 0) {
    return defaults.sort((a, b) => a.sort_order - b.sort_order);
  }

  // Hiç varsayılan yoksa tüm aktif öğeleri döndür (24 saat)
  return items
    .filter((item) => item.is_active === 1 || item.is_active === true || item.is_active === undefined)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Ekran için oynatma listesini oluştur
 */
function buildPlaylistResponse(items, timezone) {
  const activeItems = getActivePlaylistItems(items, timezone);

  return activeItems.map((item) => ({
    id: item.id,
    mediaId: item.media_id,
    url: item.url,
    mediaType: item.media_type,
    originalName: item.original_name,
    displayDuration: item.display_duration || 10,
    isDefault: !!item.is_default,
    startTime: item.start_time,
    endTime: item.end_time,
  }));
}

module.exports = {
  getCurrentTimeInTimezone,
  timeToMinutes,
  isTimeInRange,
  getActivePlaylistItems,
  buildPlaylistResponse,
};
