const crypto = require('node:crypto');
const express = require('express');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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
    query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'active')::int AS active FROM users WHERE role = 'user'"),
    query('SELECT count(*)::int AS total FROM circles'),
    query("SELECT count(*)::int AS today FROM checkins WHERE created_at >= date_trunc('day', NOW())"),
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
    invitation: { id: result.rows[0].id, email_sent: false, invite_url: `${frontendUrl}/login.html?mode=signup&invite=${encodeURIComponent(token)}` }
  });
});

router.get('/checkins', async (_req, res) => {
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

router.get('/directory', async (_req, res) => {
  const result = await query('SELECT id, name, category, area, contact, verified FROM directory_services ORDER BY name LIMIT 500');
  return res.json({ success: true, listings: result.rows });
});

router.post('/directory', async (req, res) => {
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

router.patch('/directory/:id', async (req, res) => {
  if (typeof req.body?.verified !== 'boolean') return res.status(400).json({ success: false, message: 'Provide a verified boolean.' });
  const result = await query(
    'UPDATE directory_services SET verified = $1, updated_at = NOW() WHERE id = $2 RETURNING id, verified',
    [req.body.verified, req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ success: false, message: 'Directory listing was not found.' });
  await audit(req.user.id, 'directory.verification_changed', req.params.id, { verified: req.body.verified });
  return res.json({ success: true, listing: result.rows[0] });
});

module.exports = router;
