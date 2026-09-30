const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/profile', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
            p.phone, p.country, p.date_of_birth, p.bio, p.avatar_url
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );

  return res.json({ success: true, user: result.rows[0] });
});

router.put('/profile', requireAuth, async (req, res) => {
  const fullName = String(req.body?.full_name ?? req.user.full_name).trim();
  const phone = req.body?.phone ?? null;
  const country = req.body?.country ?? null;
  const dateOfBirth = req.body?.date_of_birth ?? null;
  const bio = req.body?.bio ?? null;
  const avatarUrl = req.body?.avatar_url ?? null;

  if (!fullName) {
    return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
  }

  await query('UPDATE users SET full_name = $1 WHERE id = $2', [fullName, req.user.id]);
  await query(
    `INSERT INTO user_profiles (user_id, phone, country, date_of_birth, bio, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       phone = EXCLUDED.phone,
       country = EXCLUDED.country,
       date_of_birth = EXCLUDED.date_of_birth,
       bio = EXCLUDED.bio,
       avatar_url = EXCLUDED.avatar_url`,
    [req.user.id, phone, country, dateOfBirth, bio, avatarUrl]
  );

  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
            p.phone, p.country, p.date_of_birth, p.bio, p.avatar_url
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  );

  return res.json({ success: true, message: 'Profile updated successfully.', user: result.rows[0] });
});

module.exports = router;
