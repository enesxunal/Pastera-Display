/**
 * Vercel serverless giriş noktası
 * Tüm istekler bu dosyadan geçer
 */
const createApp = require('../server/app');
const { initDatabase } = require('../server/db');
const { seedAdmin } = require('../server/db/seed');
const config = require('../server/config');

let app;
let initialized = false;

async function getApp() {
  if (!initialized) {
    await initDatabase();
    await seedAdmin(config.adminUsername, config.adminPassword);
    app = createApp();
    initialized = true;
  }
  return app;
}

module.exports = async (req, res) => {
  const expressApp = await getApp();
  return expressApp(req, res);
};
