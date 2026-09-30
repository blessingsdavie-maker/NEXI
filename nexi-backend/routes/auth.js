const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at
  };
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(process.env.COOKIE_NAME || 'nexi_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

// POST /signup
router.post('/signup', async (req, res) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const inviteToken = req.body?.invite_token ? String(req.body.invite_token).trim() : null;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount) {
      return res.status(409).json({ success: false, message: 'An account with that email already exists.' });
    }

    let role = 'user';

    if (inviteToken) {
      const invite = await query(
        `SELECT id, role FROM invite_tokens
         WHERE token = $1
           AND active = TRUE
           AND used_count < max_uses
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [inviteToken]
      );

      if (!invite.rowCount) {
        return res.status(400).json({ success: false, message: 'That invitation token is invalid or expired.' });
      }

      role = invite.rows[0].role;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const clientResult = await query(
      `INSERT INTO users (full_name, email, password_hash, role, invite_token_used)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role, status, created_at, updated_at, last_login_at`,
      [fullName, email, passwordHash, role, inviteToken]
    );

    const user = clientResult.rows[0];

    await query(
      `INSERT INTO user_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    if (inviteToken) {
      await query(
        `UPDATE invite_tokens
         SET used_count = used_count + 1,
             active = CASE WHEN used_count + 1 >= max_uses THEN FALSE ELSE active END
         WHERE token = $1`,
        [inviteToken]
      );
    }

    const token = signToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: publicUser(user),
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create your account right now.' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const result = await query(
      `SELECT id, full_name, email, password_hash, role, status, created_at, updated_at, last_login_at
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    }

    const loginResult = await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1
       RETURNING id, full_name, email, role, status, created_at, updated_at, last_login_at`,
      [user.id]
    );

    const loggedInUser = loginResult.rows[0];
    const token = signToken(loggedInUser);
    setAuthCookie(res, token);

    return res.json({
      success: true,
      message: 'Signed in successfully.',
      user: publicUser(loggedInUser),
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Unable to sign you in right now.' });
  }
});

// GET /me
router.get('/me', requireAuth, async (req, res) => {
  const profile = await query(
    `SELECT phone, country, date_of_birth, bio, avatar_url
     FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [req.user.id]
  );

  return res.json({
    success: true,
    user: publicUser(req.user),
    profile: profile.rows[0] || null
  });
});

// POST /logout
router.post('/logout', (_req, res) => {
  res.clearCookie(process.env.COOKIE_NAME || 'nexi_token', { path: '/' });
  return res.json({ success: true, message: 'Signed out successfully.' });
});

module.exports = router;
