/**
 * Pastera Screen Player
 * Tek ekran modu için oynatıcı
 * - Playlist polling ile güncellenir
 * - Fade geçiş efekti
 * - Heartbeat ile çevrimiçi durumu bildirir
 */
(function () {
  'use strict';

  // URL'den ekran numarasını al: /screen/1
  const pathParts = window.location.pathname.split('/');
  const screenId = parseInt(pathParts[pathParts.length - 1], 10);

  if (![1, 2, 3].includes(screenId)) {
    document.body.innerHTML = '<div class="screen-placeholder">Geçersiz ekran</div>';
    return;
  }

  const container = document.getElementById('player');
  const statusEl = document.getElementById('status');

  let playlist = [];
  let currentIndex = 0;
  let contentVersion = 0;
  let pollInterval = 5000;
  let timer = null;
  let isTransitioning = false;

  /** API isteği */
  async function api(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`API hatası: ${res.status}`);
    return res.json();
  }

  /** Canlılık sinyali gönder */
  async function sendHeartbeat() {
    try {
      await api(`/api/screens/${screenId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayMode: 'single' }),
      });
    } catch (e) {
      // Sessizce devam et
    }
  }

  /** Playlist'i sunucudan al */
  async function fetchPlaylist() {
    const data = await api(`/api/screens/${screenId}/playlist`);
    pollInterval = data.pollInterval || 5000;

    if (data.version !== contentVersion) {
      contentVersion = data.version;
      playlist = data.playlist || [];
      currentIndex = 0;
      playCurrent();
    }

    if (statusEl) {
      statusEl.textContent = `Ekran ${screenId} | v${contentVersion} | ${playlist.length} içerik`;
    }
  }

  /** Mevcut içeriği oynat */
  function playCurrent() {
    clearTimeout(timer);

    if (!playlist.length) {
      container.innerHTML = '<div class="screen-placeholder">Pastera<br><small style="font-size:1rem;color:#333">İçerik bekleniyor...</small></div>';
      return;
    }

    if (currentIndex >= playlist.length) {
      currentIndex = 0;
    }

    const item = playlist[currentIndex];
    showMedia(item);
  }

  /** Medyayı fade efektiyle göster */
  function showMedia(item) {
    if (isTransitioning) return;
    isTransitioning = true;

    const wrapper = document.createElement('div');
    wrapper.className = 'screen-container fade-enter';
    wrapper.style.position = 'absolute';
    wrapper.style.inset = '0';

    if (item.mediaType === 'video') {
      const video = document.createElement('video');
      video.className = 'screen-media cover';
      video.src = item.url;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.loop = false;

      video.onended = () => {
        nextItem();
      };

      video.onerror = () => {
        nextItem();
      };

      wrapper.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.className = 'screen-media cover';
      img.src = item.url;
      img.alt = item.originalName || '';

      img.onload = () => {
        // Görsel süresi kadar bekle
        timer = setTimeout(nextItem, (item.displayDuration || 10) * 1000);
      };

      img.onerror = () => {
        nextItem();
      };

      wrapper.appendChild(img);
    }

    // Eski içeriği fade-out yap
    const old = container.firstElementChild;
    if (old) {
      old.classList.add('fade-exit-active');
      setTimeout(() => old.remove(), 800);
    }

    container.appendChild(wrapper);

    // Fade-in
    requestAnimationFrame(() => {
      wrapper.classList.add('fade-enter-active');
      wrapper.classList.remove('fade-enter');
      isTransitioning = false;

      // Video otomatik başlasın
      const video = wrapper.querySelector('video');
      if (video) {
        video.play().catch(() => nextItem());
      }
    });
  }

  /** Sonraki içeriğe geç */
  function nextItem() {
    currentIndex = (currentIndex + 1) % Math.max(playlist.length, 1);
    playCurrent();
  }

  /** Periyodik güncelleme kontrolü */
  async function poll() {
    try {
      const versionData = await api('/api/screens/content-version/check');
      if (versionData.version !== contentVersion) {
        await fetchPlaylist();
      }
    } catch (e) {
      // Bağlantı yoksa mevcut içerikle devam et
    }
  }

  /** Başlat */
  async function init() {
    try {
      await fetchPlaylist();
    } catch (e) {
      container.innerHTML = '<div class="screen-placeholder">Bağlantı bekleniyor...</div>';
    }

    // Heartbeat her 30 saniyede
    sendHeartbeat();
    setInterval(sendHeartbeat, 30000);

    // İçerik kontrolü
    setInterval(poll, pollInterval);

    // Saat değişiminde playlist'i yenile (zamanlama için)
    setInterval(async () => {
      try {
        await fetchPlaylist();
      } catch (e) { /* devam */ }
    }, 60000);
  }

  init();
})();
