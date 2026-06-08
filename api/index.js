/**
 * Vercel — media ve screens API (Express)
 */
const serverless = require('serverless-http');
const createApp = require('../server/app');
const { initDatabase } = require('../server/db');
const config = require('../server/config');

let handler = null;
let initPromise = null;

async function bootstrap() {
  if (!initPromise) {
    initPromise = (async () => {
      await initDatabase();
      return serverless(createApp());
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
    console.error('API hatası:', err);
    res.status(500).json({ error: err.message });
  }
};
