/**
 * Pastera Admin Panel
 * Medya yükleme, ekran atama, zamanlama yönetimi
 */
(function () {
  'use strict';

  let token = localStorage.getItem('pastera_token');
  let currentScreen = 1;
  let mediaList = [];
  let playlistItems = [];
  let screens = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /** API isteği - oturum token'ı ile */
  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      logout();
      throw new Error('Oturum süresi doldu');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 504) {
        throw new Error('Sunucu yavaş başlıyor, 10 saniye bekleyip tekrar deneyin');
      }
      throw new Error(data.message || data.error || `Sunucu hatası (${res.status})`);
    }
    return data;
  }

  /** Toast bildirim göster */
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `fixed bottom-6 right-6 text-sm px-4 py-3 rounded-xl shadow-lg z-50 ${isError ? 'bg-red-600' : 'bg-gray-800'} text-white`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  }

  /** Giriş */
  async function login(username, password) {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    token = data.token;
    localStorage.setItem('pastera_token', token);
    showDashboard(data.user.username);
  }

  function logout() {
    token = null;
    localStorage.removeItem('pastera_token');
    $('#login-view').classList.remove('hidden');
    $('#dashboard-view').classList.add('hidden');
  }

  /** Panel göster */
  function showDashboard(username) {
    $('#login-view').classList.add('hidden');
    $('#dashboard-view').classList.remove('hidden');
    $('#user-label').textContent = username;
    setScreenUrls();
    loadAll();
    // Ekran durumunu periyodik yenile
    setInterval(loadScreens, 15000);
  }

  /** Ekran URL'lerini göster */
  function setScreenUrls() {
    const base = window.location.origin;
    $('#url-1').textContent = `Ekran 1 → ${base}/screen/1`;
    $('#url-2').textContent = `Ekran 2 → ${base}/screen/2`;
    $('#url-3').textContent = `Ekran 3 → ${base}/screen/3`;
    $('#url-unified').textContent = `${base}/screen/unified`;
  }

  /** Tüm verileri yükle */
  async function loadAll() {
    await Promise.all([loadMedia(), loadScreens(), loadPlaylist()]);
  }

  /** Medya listesi */
  async function loadMedia() {
    try {
      mediaList = await api('/api/media');
      renderMediaLibrary();
    } catch (err) {
      toast('Medya listesi yüklenemedi: ' + err.message, true);
    }
  }

  /** Ekran durumları */
  async function loadScreens() {
    screens = await api('/api/screens');
    renderScreenStatus();
  }

  /** Aktif ekranın playlist'i */
  async function loadPlaylist() {
    try {
      playlistItems = await api(`/api/screens/${currentScreen}/playlist-items`);
      renderPlaylist();
    } catch (err) {
      toast('Playlist yüklenemedi: ' + err.message, true);
    }
  }

  /** Medya kütüphanesini çiz */
  function renderMediaLibrary() {
    const el = $('#media-library');
    if (!mediaList.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Henüz medya yok</p>';
      return;
    }

    el.innerHTML = mediaList.map((m) => `
      <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 border border-gray-100 cursor-grab"
           draggable="true" data-media-id="${m.id}" data-media-type="${m.media_type}">
        ${m.media_type === 'video'
          ? `<div class="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-white text-xs flex-shrink-0">MP4</div>`
          : `<img src="${m.url}" class="w-12 h-12 object-cover rounded-lg flex-shrink-0" alt="">`
        }
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-700 truncate">${m.original_name}</p>
          <p class="text-xs text-gray-400">${m.media_type === 'video' ? 'Video' : 'Görsel'}</p>
        </div>
        <button class="add-to-screen text-xs bg-pastera text-white px-2 py-1 rounded-lg hover:bg-pastera-dark flex-shrink-0" data-id="${m.id}">Ekrana Ekle</button>
        <button class="delete-media text-gray-300 hover:text-red-500 text-lg leading-none px-1" data-id="${m.id}" title="Sil">×</button>
      </div>
    `).join('');

    // Sürükleme olayları
    el.querySelectorAll('[draggable="true"]').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.mediaId);
        e.dataTransfer.setData('mediaId', item.dataset.mediaId);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });

    // Ekrana ekle butonu
    el.querySelectorAll('.add-to-screen').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await addMediaToScreen(parseInt(btn.dataset.id, 10));
      });
    });

    // Silme
    el.querySelectorAll('.delete-media').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Bu medyayı silmek istediğinize emin misiniz?')) return;
        try {
          await api(`/api/media/${btn.dataset.id}`, { method: 'DELETE' });
          toast('Medya silindi');
          loadAll();
        } catch (err) {
          toast(err.message, true);
        }
      });
    });
  }

  /** Ekran durum kartları */
  function renderScreenStatus() {
    const el = $('#screen-status-grid');
    el.innerHTML = screens.map((s) => `
      <div class="flex items-center gap-3 p-4 rounded-xl border ${s.isOnline ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}">
        <div class="w-3 h-3 rounded-full flex-shrink-0 ${s.isOnline ? 'bg-green-500 online-dot' : 'bg-gray-300'}"></div>
        <div class="flex-1">
          <p class="font-medium text-gray-800">${s.name}</p>
          <p class="text-xs ${s.isOnline ? 'text-green-600' : 'text-gray-400'}">
            ${s.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
            ${s.lastSeen ? ` · Son: ${formatTime(s.lastSeen)}` : ''}
          </p>
        </div>
        <a href="/screen/${s.slug}" target="_blank"
           class="text-xs text-pastera hover:underline">Aç →</a>
      </div>
    `).join('');
  }

  /** Playlist'i çiz */
  function renderPlaylist() {
    const el = $('#playlist-items');

    if (!playlistItems.length) {
      el.innerHTML = '<p class="text-gray-400 text-sm text-center py-6">Bu ekrana henüz içerik eklenmedi</p>';
      return;
    }

    el.innerHTML = playlistItems.map((item, idx) => `
      <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 playlist-item"
           data-item-id="${item.id}" draggable="true">
        <span class="text-gray-300 text-sm w-5">${idx + 1}</span>
        ${item.media_type === 'video'
          ? `<div class="w-14 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-white text-xs flex-shrink-0">MP4</div>`
          : `<img src="${item.url}" class="w-14 h-10 object-cover rounded-lg flex-shrink-0" alt="">`
        }
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-700 truncate">${item.original_name}</p>
          <p class="text-xs text-gray-400">
            ${item.media_type === 'image' ? `${item.display_duration}s` : 'Video (tam süre)'}
            ${item.start_time || item.end_time
              ? ` · ${item.start_time || '00:00'} – ${item.end_time || '24:00'}`
              : ' · 24 saat'}
            ${item.is_default ? ' · <span class="text-pastera-dark">Varsayılan</span>' : ''}
          </p>
        </div>
        <button class="edit-item text-gray-400 hover:text-pastera text-sm px-2" data-id="${item.id}">Düzenle</button>
        <button class="delete-item text-gray-300 hover:text-red-500 text-lg leading-none px-1" data-id="${item.id}">×</button>
      </div>
    `).join('');

    // Playlist sıralama sürükleme
    setupPlaylistDragSort();

    // Düzenle / Sil
    el.querySelectorAll('.edit-item').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id)));
    });
    el.querySelectorAll('.delete-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Bu içeriği listeden kaldırmak istiyor musunuz?')) return;
        try {
          await api(`/api/screens/playlist-items/${btn.dataset.id}`, { method: 'DELETE' });
          toast('İçerik kaldırıldı');
          loadPlaylist();
        } catch (err) {
          toast(err.message, true);
        }
      });
    });
  }

  /** Playlist sıralama */
  function setupPlaylistDragSort() {
    const items = $$('.playlist-item');
    let dragSrc = null;

    items.forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        dragSrc = item;
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        if (!dragSrc || dragSrc === item) return;

        const container = $('#playlist-items');
        const allItems = [...container.querySelectorAll('.playlist-item')];
        const fromIdx = allItems.indexOf(dragSrc);
        const toIdx = allItems.indexOf(item);

        if (fromIdx < toIdx) {
          item.after(dragSrc);
        } else {
          item.before(dragSrc);
        }

        const newOrder = [...container.querySelectorAll('.playlist-item')].map((el) => parseInt(el.dataset.itemId));
        try {
          await api(`/api/screens/${currentScreen}/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ itemIds: newOrder }),
          });
          loadPlaylist();
        } catch (err) {
          toast(err.message, true);
        }
      });
    });
  }

  /** Medyayı aktif ekrana ekle */
  async function addMediaToScreen(mediaId) {
    try {
      await api(`/api/screens/${currentScreen}/playlist-items`, {
        method: 'POST',
        body: JSON.stringify({ mediaId, sortOrder: playlistItems.length }),
      });
      toast(`Ekran ${currentScreen}'e eklendi`);
      loadPlaylist();
    } catch (err) {
      toast(err.message, true);
    }
  }

  /** Drop zone - medyayı ekrana ekle */
  function setupDropZone() {
    const zone = $('#playlist-dropzone');

    ['dragenter', 'dragover'].forEach((evt) => {
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const mediaId = parseInt(e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('mediaId'));
      if (!mediaId) {
        toast('Sürükleme başarısız — "Ekrana Ekle" butonunu kullanın', true);
        return;
      }
      await addMediaToScreen(mediaId);
    });
  }

  /** Dosya yükleme */
  function setupUpload() {
    $('#file-upload').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;

      let ok = 0;
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        try {
          await api('/api/media/upload', { method: 'POST', body: form, headers: {} });
          ok++;
        } catch (err) {
          toast(`${file.name}: ${err.message}`, true);
        }
      }

      if (ok > 0) {
        toast(`${ok} dosya yüklendi — "Ekrana Ekle" ile atayın`);
        await loadMedia();
      }
      e.target.value = '';
    });
  }

  /** Düzenleme modal */
  function openEditModal(itemId) {
    const item = playlistItems.find((i) => i.id === itemId);
    if (!item) return;

    $('#edit-item-id').value = itemId;
    $('#edit-duration').value = item.display_duration || 10;
    $('#edit-start').value = item.start_time || '';
    $('#edit-end').value = item.end_time || '';
    $('#edit-default').checked = !!item.is_default;
    $('#edit-modal').classList.remove('hidden');
  }

  function closeEditModal() {
    $('#edit-modal').classList.add('hidden');
  }

  /** Ekran sekmeleri */
  function setupTabs() {
    $$('.screen-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.screen-tab').forEach((t) => {
          t.classList.remove('active-tab', 'bg-pastera', 'text-white');
          t.classList.add('text-gray-500');
        });
        tab.classList.add('active-tab', 'bg-pastera', 'text-white');
        tab.classList.remove('text-gray-500');
        currentScreen = parseInt(tab.dataset.screen);
        loadPlaylist();
      });
    });
  }

  /** Tarih formatla */
  function formatTime(isoStr) {
    try {
      return new Intl.DateTimeFormat('tr-TR', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(isoStr));
    } catch {
      return isoStr;
    }
  }

  /** Olay dinleyicileri */
  function setupEvents() {
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const username = $('#login-username').value;
      const password = $('#login-password').value;
      $('#login-error').classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Giriş yapılıyor...';
      try {
        await login(username, password);
      } catch (err) {
        $('#login-error').textContent = err.message;
        $('#login-error').classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Giriş Yap';
      }
    });

    $('#logout-btn').addEventListener('click', logout);

    $('#edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const itemId = $('#edit-item-id').value;
      try {
        await api(`/api/screens/playlist-items/${itemId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayDuration: parseInt($('#edit-duration').value) || 10,
            startTime: $('#edit-start').value || null,
            endTime: $('#edit-end').value || null,
            isDefault: $('#edit-default').checked,
          }),
        });
        toast('Ayarlar kaydedildi');
        closeEditModal();
        loadPlaylist();
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('#edit-cancel').addEventListener('click', closeEditModal);
    setupDropZone();
    setupUpload();
    setupTabs();
  }

  /** Başlangıç - oturum kontrolü */
  async function init() {
    setupEvents();

    if (token) {
      try {
        const data = await api('/api/auth/me');
        showDashboard(data.user.username);
      } catch {
        logout();
      }
    }
  }

  init();
})();
