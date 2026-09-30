const express = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', async (_req, res) => {
  const result = await query(
    `SELECT id, full_name, email, role, status, created_at, last_login_at
     FROM users ORDER BY created_at DESC`
  );

  return res.json({ success: true, users: result.rows });
});

router.get('/users/:id', async (req, res) => {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.updated_at,
            u.last_login_at, p.phone, p.country, p.date_of_birth, p.bio, p.avatar_url
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1 LIMIT 1`,
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({ success: true, user: result.rows[0] });
});

router.patch('/users/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be active or suspended.' });
  }

  const result = await query(
    `UPDATE users SET status = $1 WHERE id = $2
     RETURNING id, full_name, email, role, status, created_at, last_login_at`,
    [status, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  return res.json({ success: true, message: 'User status updated.', user: result.rows[0] });
});

module.exports = router;
