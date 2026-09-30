const crypto = require('node:crypto');
const express = require('express');
const { pool, query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const newToken = () => crypto.randomBytes(32).toString('base64url');

async function getCircle(userId, ownerOnly = false, client = { query }) {
  const ownerFilter = ownerOnly ? 'AND c.owner_user_id = $1' : '';
  const result = await client.query(
    `SELECT c.id, c.name, c.owner_user_id
       FROM circles c JOIN circle_members cm ON cm.circle_id = c.id
      WHERE cm.user_id = $1 AND cm.status = 'active' ${ownerFilter}
      GROUP BY c.id, c.name, c.owner_user_id, c.created_at
      ORDER BY (c.owner_user_id <> $1) DESC, count(cm.id) DESC, c.created_at
      LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

router.get('/dashboard', requireAuth, async (req, res) => {
  const circle = await getCircle(req.user.id);
  const members = circle ? await query(
    `SELECT cm.id, cm.status, COALESCE(u.full_name, cm.invited_name) AS full_name,
            COALESCE(u.email, cm.invited_email) AS email, u.id AS member_user_id
       FROM circle_members cm LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.circle_id = $1 ORDER BY cm.joined_at`,
    [circle.id]
  ) : { rows: [] };
  const checkins = circle ? await query(
    `SELECT ci.id, ci.status, ci.created_at, ci.user_id
       FROM check_ins ci WHERE ci.circle_id = $1
         AND ci.created_at >= date_trunc('day', now())
       ORDER BY ci.created_at DESC LIMIT 100`,
    [circle.id]
  ) : { rows: [] };
  const reminder = await query(
    "SELECT enabled, to_char(reminder_time, 'HH24:MI') AS time FROM reminder_settings WHERE user_id = $1",
    [req.user.id]
  );
  const activity = await query(
    'SELECT status, created_at FROM check_ins WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
    [req.user.id]
  );
  return res.json({
    success: true,
    user: req.user,
    circle: circle ? { id: circle.id, name: circle.name } : null,
    members: members.rows,
    checkins: checkins.rows,
    reminder: reminder.rows[0] || { enabled: true, time: '19:00' },
    activity: activity.rows
  });
});

router.post('/circle/invitations', requireAuth, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const fullName = String(req.body?.full_name || '').trim();
  if (fullName.length < 2 || fullName.length > 70 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid name and email address.' });
  }
  if (email === req.user.email) return res.status(400).json({ success: false, message: 'You cannot invite your own account.' });
  const circle = await getCircle(req.user.id, true);
  if (!circle) return res.status(404).json({ success: false, message: 'Your circle could not be found.' });

  const client = await pool.connect();
  const token = newToken();
  let invitation;
  try {
    await client.query('BEGIN');
    const members = await client.query(
      "SELECT count(*)::int AS count FROM circle_members WHERE circle_id = $1 AND status IN ('active', 'invited')",
      [circle.id]
    );
    if (members.rows[0].count >= 8) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Your circle has reached its 8-member limit.' });
    }
    const existing = await client.query(
      "SELECT id FROM circle_members WHERE circle_id = $1 AND invited_email = $2 AND status IN ('active', 'invited')",
      [circle.id, email]
    );
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'That email is already in your circle or has a pending invitation.' });
    }
    const created = await client.query(
      `INSERT INTO circle_invitations (circle_id, invited_by, email, full_name, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days') RETURNING id`,
      [circle.id, req.user.id, email, fullName, hashToken(token)]
    );
    invitation = created.rows[0];
    await client.query(
      "INSERT INTO circle_members (circle_id, invitation_id, invited_email, invited_name, status) VALUES ($1, $2, $3, $4, 'invited')",
      [circle.id, invitation.id, email, fullName]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4173').split(',')[0].trim().replace(/\/$/, '');
  return res.status(201).json({
    success: true,
    invitation: {
      id: invitation.id,
      email,
      full_name: fullName,
      email_sent: false,
      invite_url: `${frontendUrl}/login.html?mode=register&invite=${encodeURIComponent(token)}`
    }
  });
});

router.post('/circle/invitations/accept', requireAuth, async (req, res) => {
  const token = String(req.body?.invite_token || '');
  if (!token) return res.status(400).json({ success: false, message: 'An invitation token is required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, circle_id FROM circle_invitations
        WHERE token_hash = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [hashToken(token), req.user.email]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'This invitation is invalid, expired, or belongs to another email address.' });
    }
    const invitation = result.rows[0];
    if (invitation.circle_id) {
      await client.query(
        "UPDATE circle_members SET user_id = $1, status = 'active' WHERE invitation_id = $2 AND circle_id = $3",
        [req.user.id, invitation.id, invitation.circle_id]
      );
    }
    await client.query('UPDATE circle_invitations SET accepted_at = NOW() WHERE id = $1', [invitation.id]);
    await client.query('COMMIT');
    return res.json({ success: true, message: 'You joined the circle.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

router.post('/checkins', requireAuth, async (req, res) => {
  const status = req.body?.status;
  if (!['safe', 'support'].includes(status)) return res.status(400).json({ success: false, message: 'Check-in status must be safe or support.' });
  const circle = await getCircle(req.user.id);
  if (!circle) return res.status(404).json({ success: false, message: 'Your circle could not be found.' });
  const result = await query(
    'INSERT INTO check_ins (circle_id, user_id, status) VALUES ($1, $2, $3) RETURNING id, status, created_at',
    [circle.id, req.user.id, status]
  );
  return res.status(201).json({ success: true, checkin: result.rows[0] });
});

router.delete('/checkins/today', requireAuth, async (req, res) => {
  await query("DELETE FROM check_ins WHERE user_id = $1 AND created_at >= date_trunc('day', now())", [req.user.id]);
  return res.json({ success: true, message: "Today's check-in was cleared." });
});

router.get('/reminder', requireAuth, async (req, res) => {
  const result = await query(
    "SELECT enabled, to_char(reminder_time, 'HH24:MI') AS time FROM reminder_settings WHERE user_id = $1",
    [req.user.id]
  );
  return res.json({ success: true, reminder: result.rows[0] || { enabled: true, time: '19:00' } });
});

router.put('/reminder', requireAuth, async (req, res) => {
  const enabled = req.body?.enabled;
  const time = String(req.body?.time || '');
  if (typeof enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return res.status(400).json({ success: false, message: 'Provide a valid reminder setting and 24-hour time.' });
  }
  const result = await query(
    `INSERT INTO reminder_settings (user_id, enabled, reminder_time) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled, reminder_time = EXCLUDED.reminder_time, updated_at = NOW()
     RETURNING enabled, to_char(reminder_time, 'HH24:MI') AS time`,
    [req.user.id, enabled, time]
  );
  return res.json({ success: true, reminder: result.rows[0] });
});

router.get('/directory', async (req, res) => {
  const search = `%${String(req.query.search || '').trim().slice(0, 100)}%`;
  const category = String(req.query.category || '').trim().toLowerCase();
  const result = await query(
    `SELECT id, name, category, area, contact FROM directory_services
      WHERE verified = TRUE AND (name ILIKE $1 OR category ILIKE $1 OR area ILIKE $1)
        AND ($2::text = '' OR LOWER(category) = $2)
      ORDER BY name LIMIT 100`,
    [search, category]
  );
  return res.json({ success: true, listings: result.rows });
});

module.exports = router;
