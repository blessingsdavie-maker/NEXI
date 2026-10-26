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
    `SELECT id, full_name, email, role, status, created_at, updated_at, last_login_at
     FROM users WHERE id = $1 LIMIT 1`,
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
    `UPDATE users SET status = $1 WHERE id = $2 AND role = 'user'
     RETURNING id, full_name, email, role, status, created_at, last_login_at`,
    [status, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Member account was not found.' });
  }

  await query(
    `INSERT INTO admin_audit_log (admin_user_id, action, target_id, details)
     VALUES ($1, 'member.status_changed', $2, $3)`,
    [req.user.id, req.params.id, { status }]
  );
  return res.json({ success: true, message: 'User status updated.', user: result.rows[0] });
});

module.exports = router;
