const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT token doğrulama middleware'i
 * Admin paneli API isteklerini korur
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Oturum süresi doldu, tekrar giriş yapın' });
  }
}

module.exports = { authMiddleware };
