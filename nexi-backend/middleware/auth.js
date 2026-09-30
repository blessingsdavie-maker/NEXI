const jwt = require('jsonwebtoken');
const { query } = require('../db');

function getToken(req) {
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return req.cookies?.[process.env.COOKIE_NAME || 'nexi_token'] || null;
}

async function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      `SELECT id, full_name, email, role, status, created_at, updated_at, last_login_at
       FROM users WHERE id = $1 LIMIT 1`,
      [payload.sub]
    );

    const user = result.rows[0];
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Your account is not active.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Your session is invalid or has expired.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
