/**
 * Pastera Unified Player
 * Birleşik mod: 3 ekran yan yana tek sayfada
 * Her panel kendi playlist'ini bağımsız oynatır
 */
(function () {
  'use strict';

  const PANELS = [1, 2, 3];

  /** Tek panel oynatıcı sınıfı */
  class PanelPlayer {
    constructor(screenId, containerEl) {
      this.screenId = screenId;
      this.container = containerEl;
      this.playlist = [];
      this.currentIndex = 0;
      this.contentVersion = 0;
      this.pollInterval = 5000;
      this.timer = null;
      this.isTransitioning = false;
    }

    async api(url, options = {}) {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`API hatası: ${res.status}`);
      return res.json();
    }

    async fetchPlaylist() {
      const data = await this.api(`/api/screens/${this.screenId}/playlist`);
      this.pollInterval = data.pollInterval || 5000;

      if (data.version !== this.contentVersion) {
        this.contentVersion = data.version;
        this.playlist = data.playlist || [];
        this.currentIndex = 0;
        this.playCurrent();
      }
    }

    playCurrent() {
      clearTimeout(this.timer);

      if (!this.playlist.length) {
        this.container.innerHTML = `<div class="screen-placeholder">Ekran ${this.screenId}<br><small style="font-size:0.8rem;color:#333">İçerik bekleniyor</small></div>`;
        return;
      }

      if (this.currentIndex >= this.playlist.length) {
        this.currentIndex = 0;
      }

      this.showMedia(this.playlist[this.currentIndex]);
    }

    showMedia(item) {
      if (this.isTransitioning) return;
      this.isTransitioning = true;

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
        video.onended = () => this.nextItem();
        video.onerror = () => this.nextItem();
        wrapper.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.className = 'screen-media cover';
        img.src = item.url;
        img.alt = item.originalName || '';
        img.onload = () => {
          this.timer = setTimeout(() => this.nextItem(), (item.displayDuration || 10) * 1000);
        };
        img.onerror = () => this.nextItem();
        wrapper.appendChild(img);
      }

      const old = this.container.firstElementChild;
      if (old) {
        old.classList.add('fade-exit-active');
        setTimeout(() => old.remove(), 800);
      }

      this.container.appendChild(wrapper);

      requestAnimationFrame(() => {
        wrapper.classList.add('fade-enter-active');
        wrapper.classList.remove('fade-enter');
        this.isTransitioning = false;
        const video = wrapper.querySelector('video');
        if (video) video.play().catch(() => this.nextItem());
      });
    }

    nextItem() {
      this.currentIndex = (this.currentIndex + 1) % Math.max(this.playlist.length, 1);
      this.playCurrent();
    }

    async poll() {
      try {
        const data = await this.api('/api/screens/content-version/check');
        if (data.version !== this.contentVersion) {
          await this.fetchPlaylist();
        }
      } catch (e) { /* devam */ }
    }

    async init() {
      try {
        await this.fetchPlaylist();
      } catch (e) {
        this.container.innerHTML = '<div class="screen-placeholder">Bağlantı bekleniyor...</div>';
      }

      setInterval(() => this.poll(), this.pollInterval);
      setInterval(() => this.fetchPlaylist().catch(() => {}), 60000);
    }
  }

  /** Tüm panelleri başlat */
  async function init() {
    const players = [];

    PANELS.forEach((id) => {
      const panelEl = document.getElementById(`panel-${id}`);
      if (panelEl) {
        const player = new PanelPlayer(id, panelEl);
        players.push(player);
        player.init();
      }
    });

    // Birleşik mod heartbeat (ekran 1 üzerinden bildir)
    async function heartbeat() {
      try {
        await fetch('/api/screens/1/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayMode: 'unified' }),
        });
      } catch (e) { /* devam */ }
    }

    heartbeat();
    setInterval(heartbeat, 30000);
  }

  init();
})();
