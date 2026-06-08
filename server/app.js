const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { ensureUploadDir, UPLOAD_DIR } = require('./services/storage');

const authRoutes = require('./routes/auth');
const mediaRoutes = require('./routes/media');
const screenRoutes = require('./routes/screens');

/**
 * Express uygulamasını oluştur ve yapılandır
 */
function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Yerel medya dosyaları
  ensureUploadDir();
  app.use('/uploads', express.static(UPLOAD_DIR));

  // API rotaları
  app.use('/api/auth', authRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/screens', screenRoutes);

  // Statik dosyalar (admin, screen, js, css)
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));

  // Admin paneli
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin', 'index.html'));
  });

  // Tek ekran modu: /screen/1, /screen/2, /screen/3
  app.get('/screen/:id', (req, res) => {
    const id = req.params.id;
    if (id === 'unified') {
      return res.sendFile(path.join(publicDir, 'screen', 'unified.html'));
    }
    if (!['1', '2', '3'].includes(id)) {
      return res.status(404).send('Ekran bulunamadı');
    }
    res.sendFile(path.join(publicDir, 'screen', 'index.html'));
  });

  // Birleşik ekran modu (3 ekran yan yana tek sayfada)
  app.get('/screen/unified', (req, res) => {
    res.sendFile(path.join(publicDir, 'screen', 'unified.html'));
  });

  // Ana sayfa yönlendirme
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // Sağlık kontrolü
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Pastera Display' });
  });

  return app;
}

module.exports = createApp;
