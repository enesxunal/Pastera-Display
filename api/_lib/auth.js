const jwt = require('jsonwebtoken');

function verifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new Error('Giriş gerekli');
  return jwt.verify(token, process.env.JWT_SECRET || 'pastera-dev-secret');
}

function requireAuth(handler) {
  return async (req, res) => {
    try {
      req.user = verifyToken(req);
      return handler(req, res);
    } catch {
      return res.status(401).json({ error: 'Giriş gerekli' });
    }
  };
}

module.exports = { verifyToken, requireAuth };
