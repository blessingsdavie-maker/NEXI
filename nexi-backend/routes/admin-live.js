const crypto = require('node:crypto');
const express = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin, requireFullAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

async function audit(adminId, action, targetId, details = {}) {
  await query(
    'INSERT INTO admin_audit_log (admin_user_id, action, target_id, details) VALUES ($1, $2, $3, $4)',
    [adminId, action, targetId || null, details]
  );
}

router.get('/overview', async (_req, res) => {
  const [members, circles, checkins, pending, directory] = await Promise.all([
    query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'active')::int AS active,
              count(*) FILTER (WHERE status = 'suspended')::int AS suspended,
              count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS recent
         FROM users WHERE role = 'user'`
    ),
    query('SELECT count(*)::int AS total FROM circles'),
    query(
      `SELECT count(*)::int AS today,
              count(*) FILTER (WHERE status = 'support')::int AS support_today
         FROM checkins WHERE created_at >= date_trunc('day', NOW())`
    ),
    query(
      `SELECT count(*)::int AS pending FROM circle_members cm
        WHERE cm.status = 'active' AND cm.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM checkins ci WHERE ci.user_id = cm.user_id AND ci.circle_id = cm.circle_id AND ci.created_at >= date_trunc('day', NOW()))`
    ),
    query('SELECT count(*)::int AS pending FROM directory_services WHERE verified = FALSE')
  ]);
  return res.json({
    success: true,
    members: members.rows[0],
    circles: circles.rows[0].total,
    checkins_today: checkins.rows[0].today,
    support_signals_today: checkins.rows[0].support_today,
    checkins_pending: pending.rows[0].pending,
    directory_pending: directory.rows[0].pending
  });
});

router.get('/members', async (req, res) => {
  const search = `%${String(req.query.search || '').trim().slice(0, 100)}%`;
  const filter = req.query.status === 'paused' ? 'suspended' : req.query.status === 'active' ? 'active' : null;
  const result = await query(
    `SELECT u.id, u.full_name, u.email,
            CASE WHEN u.status = 'suspended' THEN 'paused' ELSE u.status END AS status,
            u.created_at,
            (SELECT c.name FROM circles c WHERE c.owner_user_id = u.id ORDER BY c.created_at LIMIT 1) AS circle
       FROM users u WHERE u.role = 'user' AND (u.full_name ILIKE $1 OR u.email ILIKE $1)
         AND ($2::text IS NULL OR u.status = $2) ORDER BY u.created_at DESC LIMIT 200`,
    [search, filter]
  );
  return res.json({ success: true, members: result.rows });
});

router.patch('/members/:id/status', async (req, res) => {
  const requested = req.body?.status;
  if (!['active', 'paused'].includes(requested)) return res.status(400).json({ success: false, message: 'Status must be active or paused.' });
  const status = requested === 'paused' ? 'suspended' : 'active';
  const result = await query(
    "UPDATE users SET status = $1 WHERE id = $2 AND role = 'user' RETURNING id, status",
    [status, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Member account was not found.' });
  await audit(req.user.id, 'member.status_changed', req.params.id, { status: requested });
  return res.json({ success: true, member: { ...result.rows[0], status: requested } });
});

router.post('/invitations', async (req, res) => {
  const fullName = String(req.body?.full_name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (fullName.length < 2 || fullName.length > 70 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid name and email address.' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const result = await query(
    `INSERT INTO invite_tokens (token, role, max_uses, expires_at, active, invited_name, invited_email)
     VALUES ($1, 'user', 1, NOW() + INTERVAL '7 days', TRUE, $2, $3) RETURNING id`,
    [token, fullName, email]
  );
  await audit(req.user.id, 'member.invited', result.rows[0].id, { email });
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4173').split(',')[0].trim().replace(/\/$/, '');
  return res.status(201).json({
    success: true,
    invitation: { id: result.rows[0].id, email_sent: false, invite_url: `${frontendUrl}/login.html?mode=register&invite=${encodeURIComponent(token)}` }
  });
});

router.get('/invitations', async (_req, res) => {
  const result = await query(
    `SELECT id, invited_name, invited_email, created_at, expires_at,
            used_count, max_uses, active,
            CASE
              WHEN active = FALSE THEN 'revoked'
              WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 'expired'
              WHEN used_count >= max_uses THEN 'used'
              ELSE 'pending'
            END AS status
       FROM invite_tokens
      WHERE role = 'user'
      ORDER BY created_at DESC
      LIMIT 200`
  );
  return res.json({ success: true, invitations: result.rows });
});

router.delete('/invitations/:id', async (req, res) => {
  const result = await query(
    `UPDATE invite_tokens SET active = FALSE
      WHERE id = $1 AND role = 'user' AND active = TRUE
      RETURNING id, invited_email`,
    [req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Active invitation was not found.' });
  }
  await audit(req.user.id, 'invitation.revoked', result.rows[0].id, {
    email: result.rows[0].invited_email
  });
  return res.json({ success: true, message: 'Invitation revoked.' });
});

router.get('/checkins', requireFullAdmin, async (_req, res) => {
  const result = await query(
    `SELECT c.id, c.name, count(DISTINCT cm.user_id)::int AS members,
            count(DISTINCT ci.user_id)::int AS checked_in,
            greatest(count(DISTINCT cm.user_id) - count(DISTINCT ci.user_id), 0)::int AS pending,
            max(ci.created_at) AS last_update
       FROM circles c LEFT JOIN circle_members cm ON cm.circle_id = c.id AND cm.status = 'active'
      LEFT JOIN checkins ci ON ci.circle_id = c.id AND ci.created_at >= date_trunc('day', NOW())
      GROUP BY c.id, c.name ORDER BY c.name LIMIT 300`
  );
  return res.json({ success: true, circles: result.rows });
});

router.get('/directory', requireFullAdmin, async (_req, res) => {
  const result = await query('SELECT id, name, category, area, contact, verified FROM directory_services ORDER BY name LIMIT 500');
  return res.json({ success: true, listings: result.rows });
});

router.post('/directory', requireFullAdmin, async (req, res) => {
  const { name, category, area, contact = null } = req.body || {};
  if (![name, category, area].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ success: false, message: 'Name, category, and area are required.' });
  }
  const result = await query(
    'INSERT INTO directory_services (name, category, area, contact) VALUES ($1, $2, $3, $4) RETURNING *',
    [name.trim().slice(0, 120), category.trim().slice(0, 60), area.trim().slice(0, 120), contact]
  );
  await audit(req.user.id, 'directory.created', result.rows[0].id);
  return res.status(201).json({ success: true, listing: result.rows[0] });
});

router.patch('/directory/:id', requireFullAdmin, async (req, res) => {
  const allowedFields = {
    name: { max: 120 },
    category: { max: 60 },
    area: { max: 120 },
    contact: { max: 300 }
  };
  const assignments = [];
  const values = [];
  const details = {};
  for (const [field, constraints] of Object.entries(allowedFields)) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      const value = req.body[field];
      if (field === 'contact' && (value === null || value === '')) {
        values.push(null);
      } else if (typeof value === 'string' && value.trim()) {
        values.push(value.trim().slice(0, constraints.max));
      } else {
        return res.status(400).json({ success: false, message: `${field} must be a non-empty string.` });
      }
      assignments.push(`${field} = $${values.length}`);
      details[field] = values[values.length - 1];
    }
  }
  if (typeof req.body?.verified === 'boolean') {
    values.push(req.body.verified);
    assignments.push(`verified = $${values.length}`);
    details.verified = req.body.verified;
  } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'verified')) {
    return res.status(400).json({ success: false, message: 'Verified must be a boolean.' });
  }
  if (!assignments.length) {
    return res.status(400).json({ success: false, message: 'Provide fields to update.' });
  }
  assignments.push('updated_at = NOW()');
  values.push(req.params.id);
  const result = await query(
    `UPDATE directory_services SET ${assignments.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, category, area, contact, verified`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Directory listing was not found.' });
  await audit(req.user.id, 'directory.updated', req.params.id, details);
  return res.json({ success: true, listing: result.rows[0] });
});

router.delete('/directory/:id', requireFullAdmin, async (req, res) => {
  const result = await query(
    'DELETE FROM directory_services WHERE id = $1 AND verified = FALSE RETURNING id, name',
    [req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ success: false, message: 'Unverified directory listing was not found.' });
  }
  await audit(req.user.id, 'directory.removed', req.params.id, { name: result.rows[0].name });
  return res.json({ success: true, message: 'Unverified directory listing removed.' });
});

router.get('/audit', requireFullAdmin, async (_req, res) => {
  const result = await query(
    `SELECT l.id, l.action, l.target_id, l.details, l.created_at,
            u.full_name AS admin_name, u.email AS admin_email
       FROM admin_audit_log l
       LEFT JOIN users u ON u.id = l.admin_user_id
      ORDER BY l.created_at DESC
      LIMIT 100`
  );
  return res.json({ success: true, entries: result.rows });
});

router.get('/admins', requireSuperAdmin, async (_req, res) => {
  const result = await query(
    `SELECT id, full_name, email, role, is_super_admin, status, created_at, last_login_at
       FROM users
      WHERE role IN ('admin', 'support_admin')
      ORDER BY is_super_admin DESC, created_at ASC`
  );
  return res.json({ success: true, admins: result.rows });
});

router.patch('/users/:id/role', requireSuperAdmin, async (req, res) => {
  const role = req.body?.role;
  if (!['user', 'admin', 'support_admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Role must be user, support_admin, or admin.' });
  }
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ success: false, message: 'You cannot change your own administrator role.' });
  }

  const result = await query(
    `UPDATE users
        SET role = $1
      WHERE id = $2 AND is_super_admin = FALSE AND role <> $1
      RETURNING id, full_name, email, role, status`,
    [role, req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: 'Account was not found, is protected, or already has that role.'
    });
  }

  await audit(req.user.id, 'account.role_changed', result.rows[0].id, { role });
  return res.json({ success: true, user: result.rows[0] });
});

module.exports = router;
