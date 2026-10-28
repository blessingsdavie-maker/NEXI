"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const router = express.Router();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured for the social routes.");
}

// A small dedicated pool keeps this module independent of the private
// exports in db.js. It connects to the same DATABASE_URL as the main app.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initializeSocialSchema() {
  // initializeSchema() in db.js must run before this function, because users
  // is the parent table used by username search and the social features.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(24)`);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_case_insensitive_uq
      ON users (LOWER(username))
      WHERE username IS NOT NULL AND username <> ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nalsafe_social_invitations (
      id BIGSERIAL PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      responded_at TIMESTAMPTZ,
      CHECK (sender_id <> recipient_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS nalsafe_social_invites_recipient_idx
      ON nalsafe_social_invitations (recipient_id, status, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS nalsafe_social_invites_sender_idx
      ON nalsafe_social_invitations (sender_id, status, created_at DESC)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS nalsafe_social_one_pending_invite_uq
      ON nalsafe_social_invitations (sender_id, recipient_id)
      WHERE status = 'pending'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nalsafe_social_connections (
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_a_id, user_b_id),
      CHECK (user_a_id <> user_b_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nalsafe_social_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      body VARCHAR(2000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ,
      CHECK (sender_id <> recipient_id),
      CHECK (LENGTH(BTRIM(body)) BETWEEN 1 AND 2000)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS nalsafe_social_messages_pair_idx
      ON nalsafe_social_messages (sender_id, recipient_id, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS nalsafe_social_messages_unread_idx
      ON nalsafe_social_messages (recipient_id, read_at, created_at DESC)
  `);

  await pool.query(`
    UPDATE nalsafe_social_invitations
       SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= NOW()
  `);
}

function readToken(req) {
  const authorization = String(req.headers.authorization || "");
  if (/^Bearer\s+/i.test(authorization)) {
    return authorization.replace(/^Bearer\s+/i, "").trim();
  }

  const cookies = req.cookies || {};
  return cookies.nalsafe_token || cookies.nalsafeToken || cookies.access_token ||
    cookies.accessToken || cookies.token || cookies.jwt || null;
}

async function authenticate(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Please sign in to continue." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const rawId = decoded.id ?? decoded.userId ?? decoded.user_id ?? decoded.sub ?? decoded.user?.id;
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") {
      return res.status(401).json({ success: false, message: "Your session could not be verified. Please sign in again." });
    }

    const result = await pool.query(
      `SELECT id::text AS id, full_name, email, username, role, status
         FROM users
        WHERE id::text = $1
        LIMIT 1`,
      [String(rawId)]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: "The account for this session could not be found." });
    }

    if (String(user.status || "active").toLowerCase() !== "active") {
      return res.status(403).json({ success: false, message: "This account is not active." });
    }

    req.socialUser = user;
    next();
  } catch (error) {
    if (error && (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "NotBeforeError")) {
      return res.status(401).json({ success: false, message: "Your session has expired. Please sign in again." });
    }
    console.error("NALSAFE social authentication error:", error);
    return res.status(500).json({ success: false, message: "Could not verify your account right now." });
  }
}

router.use(authenticate);

function isNormalUser(user) {
  return String(user?.role || "user").toLowerCase() === "user";
}

function orderedPair(first, second) {
  return [String(first), String(second)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

async function hasConnection(userId, otherUserId, client = pool) {
  const [a, b] = orderedPair(userId, otherUserId);
  const result = await client.query(
    `SELECT 1 FROM nalsafe_social_connections WHERE user_a_id = $1 AND user_b_id = $2 LIMIT 1`,
    [a, b]
  );
  return result.rowCount > 0;
}

router.get("/profile", async (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.socialUser.id,
      full_name: req.socialUser.full_name,
      username: req.socialUser.username || null
    }
  });
});

router.put("/username", async (req, res) => {
  if (!isNormalUser(req.socialUser)) {
    return res.status(403).json({ success: false, message: "Only member accounts can set a member username." });
  }

  const username = String(req.body?.username || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: "Choose a username with 3–24 characters. Use only letters, numbers and underscores."
    });
  }

  if (["admin", "administrator", "support", "support_admin", "nalsafe"].includes(username.toLowerCase())) {
    return res.status(400).json({ success: false, message: "That username is reserved. Please choose another." });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET username = $1 WHERE id::text = $2 RETURNING id::text AS id, full_name, username`,
      [username, req.socialUser.id]
    );
    return res.json({ success: true, user: result.rows[0], message: "Your username has been saved." });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "That username is already in use. Try another." });
    }
    console.error("Save social username error:", error);
    return res.status(500).json({ success: false, message: "Your username could not be saved." });
  }
});

router.get("/search", async (req, res) => {
  if (!isNormalUser(req.socialUser)) {
    return res.status(403).json({ success: false, message: "Member search is available to member accounts." });
  }

  const username = String(req.query.username || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ success: false, message: "Enter the exact username (3–24 letters, numbers or underscores)." });
  }

  const result = await pool.query(
    `SELECT id::text AS id, full_name, username
       FROM users
      WHERE LOWER(username) = LOWER($1)
        AND id::text <> $2
        AND LOWER(COALESCE(status, 'active')) = 'active'
        AND LOWER(COALESCE(role, 'user')) = 'user'
      LIMIT 1`,
    [username, req.socialUser.id]
  );

  return res.json({ success: true, users: result.rows });
});

router.get("/connections", async (req, res) => {
  if (!isNormalUser(req.socialUser)) {
    return res.json({ success: true, connections: [] });
  }

  const result = await pool.query(
    `SELECT u.id::text AS id, u.full_name, u.username, c.created_at AS connected_at
       FROM nalsafe_social_connections c
       JOIN users u
         ON u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
      WHERE c.user_a_id = $1 OR c.user_b_id = $1
      ORDER BY u.full_name ASC`,
    [req.socialUser.id]
  );

  return res.json({ success: true, connections: result.rows });
});

router.post("/invitations", async (req, res) => {
  if (!isNormalUser(req.socialUser)) {
    return res.status(403).json({ success: false, message: "Only member accounts can invite other members." });
  }

  const username = String(req.body?.username || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ success: false, message: "Enter a valid member username." });
  }

  const targetResult = await pool.query(
    `SELECT id::text AS id, full_name, username
       FROM users
      WHERE LOWER(username) = LOWER($1)
        AND LOWER(COALESCE(status, 'active')) = 'active'
        AND LOWER(COALESCE(role, 'user')) = 'user'
      LIMIT 1`,
    [username]
  );
  const target = targetResult.rows[0];
  if (!target) {
    return res.status(404).json({ success: false, message: "No active member was found with that username." });
  }
  if (String(target.id) === String(req.socialUser.id)) {
    return res.status(400).json({ success: false, message: "You cannot invite your own account." });
  }
  if (await hasConnection(req.socialUser.id, target.id)) {
    return res.status(409).json({ success: false, message: "You are already connected with this member." });
  }

  const previous = await pool.query(
    `SELECT id, sender_id, recipient_id, status, expires_at
       FROM nalsafe_social_invitations
      WHERE status = 'pending'
        AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
      ORDER BY created_at DESC
      LIMIT 1`,
    [req.socialUser.id, target.id]
  );
  if (previous.rows[0]) {
    const existing = previous.rows[0];
    if (String(existing.sender_id) === String(req.socialUser.id)) {
      return res.status(409).json({ success: false, message: `Your invitation to @${target.username} is already pending.` });
    }
    return res.status(409).json({ success: false, message: `@${target.username} has already invited you. Check your Invitations tab.` });
  }

  try {
    const created = await pool.query(
      `INSERT INTO nalsafe_social_invitations (sender_id, recipient_id)
       VALUES ($1, $2)
       RETURNING id::text AS id, status, created_at, expires_at`,
      [req.socialUser.id, target.id]
    );
    return res.status(201).json({
      success: true,
      message: `Circle invitation sent to @${target.username}.`,
      invitation: { ...created.rows[0], username: target.username, full_name: target.full_name }
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "An invitation to this member is already pending." });
    }
    console.error("Create social invitation error:", error);
    return res.status(500).json({ success: false, message: "The invitation could not be created." });
  }
});

router.get("/invitations", async (req, res) => {
  await pool.query(
    `UPDATE nalsafe_social_invitations SET status = 'expired'
      WHERE status = 'pending' AND expires_at <= NOW()`
  );

  const result = await pool.query(
    `SELECT i.id::text AS id, i.status, i.created_at, i.expires_at, i.responded_at,
            i.sender_id, i.recipient_id,
            CASE WHEN i.sender_id = $1 THEN 'sent' ELSE 'received' END AS direction,
            CASE WHEN i.sender_id = $1 THEN recipient.full_name ELSE sender.full_name END AS other_name,
            CASE WHEN i.sender_id = $1 THEN recipient.username ELSE sender.username END AS other_username
       FROM nalsafe_social_invitations i
       JOIN users sender ON sender.id::text = i.sender_id
       JOIN users recipient ON recipient.id::text = i.recipient_id
      WHERE i.sender_id = $1 OR i.recipient_id = $1
      ORDER BY i.created_at DESC
      LIMIT 100`,
    [req.socialUser.id]
  );

  return res.json({ success: true, invitations: result.rows });
});

router.patch("/invitations/:id", async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();
  if (!(["accept", "decline"].includes(action))) {
    return res.status(400).json({ success: false, message: "Choose accept or decline." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id::text AS id, sender_id, recipient_id, status, expires_at
         FROM nalsafe_social_invitations
        WHERE id = $1
        FOR UPDATE`,
      [req.params.id]
    );
    const invitation = found.rows[0];

    if (!invitation) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "That invitation could not be found." });
    }
    if (String(invitation.recipient_id) !== String(req.socialUser.id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "Only the invited member can respond to this invitation." });
    }
    if (invitation.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: invitation.status === "expired" ? "This invitation has expired." : "This invitation has already been answered." });
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE nalsafe_social_invitations SET status = 'expired' WHERE id = $1`, [req.params.id]);
      await client.query("COMMIT");
      return res.status(410).json({ success: false, message: "This invitation has expired." });
    }

    if (action === "accept") {
      const [a, b] = orderedPair(invitation.sender_id, invitation.recipient_id);
      await client.query(
        `INSERT INTO nalsafe_social_connections (user_a_id, user_b_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [a, b]
      );
    }

    await client.query(
      `UPDATE nalsafe_social_invitations
          SET status = $1, responded_at = NOW()
        WHERE id = $2`,
      [action === "accept" ? "accepted" : "declined", req.params.id]
    );
    await client.query("COMMIT");
    return res.json({ success: true, message: action === "accept" ? "Invitation accepted. You are now connected." : "Invitation declined." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Respond to social invitation error:", error);
    return res.status(500).json({ success: false, message: "Your response could not be saved." });
  } finally {
    client.release();
  }
});

router.get("/conversations", async (req, res) => {
  const result = await pool.query(
    `SELECT u.id::text AS user_id, u.full_name, u.username,
            latest.body AS last_message,
            latest.created_at AS last_message_at,
            COALESCE(unread.unread_count, 0)::int AS unread_count
       FROM nalsafe_social_connections c
       JOIN users u
         ON u.id::text = CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
       LEFT JOIN LATERAL (
         SELECT m.body, m.created_at
           FROM nalsafe_social_messages m
          WHERE (m.sender_id = $1 AND m.recipient_id = u.id::text)
             OR (m.sender_id = u.id::text AND m.recipient_id = $1)
          ORDER BY m.created_at DESC
          LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread_count
           FROM nalsafe_social_messages m
          WHERE m.sender_id = u.id::text
            AND m.recipient_id = $1
            AND m.read_at IS NULL
       ) unread ON TRUE
      WHERE c.user_a_id = $1 OR c.user_b_id = $1
      ORDER BY latest.created_at DESC NULLS LAST, u.full_name ASC`,
    [req.socialUser.id]
  );
  return res.json({ success: true, conversations: result.rows });
});

router.get("/messages/:userId", async (req, res) => {
  const otherId = String(req.params.userId || "");
  if (!otherId || otherId === String(req.socialUser.id)) {
    return res.status(400).json({ success: false, message: "Choose another member to open a conversation." });
  }
  if (!(await hasConnection(req.socialUser.id, otherId))) {
    return res.status(403).json({ success: false, message: "You can message members after they accept your circle invitation." });
  }

  await pool.query(
    `UPDATE nalsafe_social_messages
        SET read_at = NOW()
      WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [otherId, req.socialUser.id]
  );
  const result = await pool.query(
    `SELECT id::text AS id, sender_id, recipient_id, body, created_at, read_at
       FROM nalsafe_social_messages
      WHERE (sender_id = $1 AND recipient_id = $2)
         OR (sender_id = $2 AND recipient_id = $1)
      ORDER BY created_at ASC
      LIMIT 300`,
    [req.socialUser.id, otherId]
  );
  return res.json({ success: true, messages: result.rows });
});

router.post("/messages", async (req, res) => {
  const recipientId = String(req.body?.recipient_id || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!recipientId || recipientId === String(req.socialUser.id)) {
    return res.status(400).json({ success: false, message: "Choose a valid recipient." });
  }
  if (!body || body.length > 2000) {
    return res.status(400).json({ success: false, message: "Messages must contain 1–2000 characters." });
  }
  if (!(await hasConnection(req.socialUser.id, recipientId))) {
    return res.status(403).json({ success: false, message: "You can message members after they accept your circle invitation." });
  }

  const recipient = await pool.query(
    `SELECT id::text AS id FROM users
      WHERE id::text = $1 AND LOWER(COALESCE(status, 'active')) = 'active'
      LIMIT 1`,
    [recipientId]
  );
  if (!recipient.rows[0]) {
    return res.status(404).json({ success: false, message: "That member is no longer available." });
  }

  const result = await pool.query(
    `INSERT INTO nalsafe_social_messages (sender_id, recipient_id, body)
     VALUES ($1, $2, $3)
     RETURNING id::text AS id, sender_id, recipient_id, body, created_at, read_at`,
    [req.socialUser.id, recipientId, body]
  );
  return res.status(201).json({ success: true, message: "Message sent.", item: result.rows[0] });
});

module.exports = { router, initializeSocialSchema };
