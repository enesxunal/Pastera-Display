/**
 * Tek API giriş noktası — Vercel Hobby 12 function limiti için
 */
const { setCors, handleOptions } = require('./_lib/cors');
const { handleRequest } = require('./_lib/router');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;

  const urlPath = (req.url || '/').split('?')[0];

  try {
    await handleRequest(req, res, urlPath);
  } catch (err) {
    console.error('API:', urlPath, err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Sunucu hatası' });
    }
  }
};
