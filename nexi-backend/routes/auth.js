const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sql = require("../lib/db");

const router = express.Router();
const sessionCookieName = "nexi_session";
const sessionDurationSeconds = 60 * 60 * 24 * 30;
const sameSite = process.env.SESSION_COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "None" : "Lax");
const secureCookie = process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true";

const readSessionToken = (req) => {
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? cookie.slice(sessionCookieName.length + 1) : null;
};

const setSessionCookie = (res, token) => {
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${sessionDurationSeconds}${secure}`);
};

const clearSessionCookie = (res) => {
  const secure = secureCookie ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`);
};

const createSession = async (user, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await sql`
    INSERT INTO user_sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${user.id}, NOW() + INTERVAL '30 days')
  `;
  setSessionCookie(res, token);
};

const currentUser = async (req) => {
  const token = readSessionToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await sql`
    SELECT users.id, users.full_name, users.email
    FROM user_sessions
    JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ${tokenHash}
      AND user_sessions.expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] || null;
};

router.post("/signup", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ success: false, message: "Full name, email and password are required." });
    }

    if (typeof full_name !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ success: false, message: "Enter valid account details." });
    }
    const cleanName = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 70) {
      return res.status(400).json({ success: false, message: "Name must be between 2 and 70 characters." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 320) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }

    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Password must be 8 or more characters and no more than 72 bytes." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = await sql`
      INSERT INTO users (
        full_name,
        email,
        password_hash
      )
      VALUES (
        ${cleanName},
        ${cleanEmail},
        ${passwordHash}
      )
      RETURNING id, full_name, email, created_at
    `;

    await createSession(newUser[0], res);
    res.status(201).json({ success: true, user: newUser[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    console.error("Signup error:", error.message);
    res.status(500).json({ success: false, message: "Unable to create account." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rows = await sql`
      SELECT id, full_name, email, password_hash
      FROM users
      WHERE LOWER(email) = ${cleanEmail}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    await createSession(user, res);
    res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email } });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ success: false, message: "Unable to sign in right now." });
  }
});

router.get("/me", async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ success: false, message: "Sign in is required." });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("Session lookup error:", error.message);
    res.status(500).json({ success: false, message: "Unable to verify your session." });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const token = readSessionToken(req);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await sql`DELETE FROM user_sessions WHERE token_hash = ${tokenHash}`;
    }
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ success: false, message: "Unable to sign out right now." });
  }
});

module.exports = router;