/**
 * Oturum kontrolü — hafif endpoint
 */
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Giriş gerekli' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pastera-dev-secret');
    return res.json({ user: { id: decoded.id, username: decoded.username } });
  } catch {
    return res.status(401).json({ error: 'Oturum geçersiz' });
  }
};
