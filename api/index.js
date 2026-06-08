/**
 * Vercel serverless giriş noktası
 */
const serverless = require('serverless-http');
const createApp = require('../server/app');
const { initDatabase } = require('../server/db');
const { seedAdmin } = require('../server/db/seed');
const config = require('../server/config');

let handler = null;
let initPromise = null;

async function bootstrap() {
  if (!initPromise) {
    initPromise = (async () => {
      await initDatabase();
      await seedAdmin(config.adminUsername, config.adminPassword);
      const app = createApp();
      return serverless(app);
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

module.exports = async (req, res) => {
  try {
    handler = await bootstrap();
    return handler(req, res);
  } catch (err) {
    console.error('Pastera Display başlatma hatası:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Sunucu başlatılamadı',
        message: err.message,
        hint: 'Supabase SQL Editor\'de supabase/setup.sql dosyasını bir kez çalıştırın. SUPABASE_URL ve SERVICE_ROLE_KEY env kontrol edin.',
      })
    );
  }
};
