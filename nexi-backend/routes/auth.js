const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const {
  query,
  pool
} = require('../db');

const {
  requireAuth
} = require('../middleware/auth');

const router = express.Router();


/* =========================================================
   TOKEN HELPERS
   ========================================================= */

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN || '7d'
    }
  );
}


function publicUser(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_super_admin: Boolean(user.is_super_admin),
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at
  };
}


function setAuthCookie(res, token) {
  const isProduction =
    process.env.NODE_ENV === 'production';

  res.cookie(
    process.env.COOKIE_NAME || 'nalsafe_token',
    token,
    {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    }
  );
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    'http://localhost:4173'
  )
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

async function sendPasswordResetEmail(email, token) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    const error = new Error('Password recovery email is not configured.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const resetUrl =
    `${getFrontendUrl()}/login.html?reset=${encodeURIComponent(token)}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Reset your NALSAFE password',
      text: `Use this link to reset your NALSAFE password. It expires in one hour:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link to reset your NALSAFE password. It expires in one hour:</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Password recovery email delivery failed:', response.status, errorText);
    throw new Error('Password recovery email could not be delivered.');
  }
}


/* =========================================================
   GET OR CREATE USER CIRCLE
   =========================================================

   Logic:

   1. If the user owns a circle, use it.
   2. Otherwise, if the user joined another circle through
      an invitation, use that circle.
   3. Otherwise create a personal circle.
   ========================================================= */

async function getOrCreateCircle(userId, client = null) {
  const db = client || { query };


  /* -------------------------------------------------------
     1. Check whether the user owns a circle.
     ------------------------------------------------------- */

  const owned = await db.query(
    `
      SELECT
        id,
        name,
        owner_user_id,
        created_at,
        updated_at
      FROM circles
      WHERE owner_user_id = $1
      LIMIT 1
    `,
    [userId]
  );


  if (owned.rows.length) {
    return owned.rows[0];
  }


  /* -------------------------------------------------------
     2. Check whether the user joined another circle.
     ------------------------------------------------------- */

  const member = await db.query(
    `
      SELECT
        c.id,
        c.name,
        c.owner_user_id,
        c.created_at,
        c.updated_at

      FROM circle_members cm

      INNER JOIN circles c
        ON c.id = cm.circle_id

      WHERE cm.user_id = $1
        AND cm.status = 'active'

      ORDER BY
        cm.joined_at ASC NULLS LAST,
        cm.created_at ASC

      LIMIT 1
    `,
    [userId]
  );


  if (member.rows.length) {
    return member.rows[0];
  }


  /* -------------------------------------------------------
     3. Create a new personal circle.
     ------------------------------------------------------- */

  await db.query(
    `
      INSERT INTO circles (
        name,
        owner_user_id
      )

      SELECT
        CONCAT(
          LEFT(TRIM(full_name), 120),
          '''s circle'
        ),
        id

      FROM users

      WHERE id = $1
        AND role = 'user'

      ON CONFLICT (owner_user_id)
      DO NOTHING
    `,
    [userId]
  );


  const created = await db.query(
    `
      SELECT
        id,
        name,
        owner_user_id,
        created_at,
        updated_at

      FROM circles

      WHERE owner_user_id = $1

      LIMIT 1
    `,
    [userId]
  );


  return created.rows[0] || null;
}


/* =========================================================
   SIGNUP
   ========================================================= */

router.post(
  '/signup',
  async (req, res) => {

    const fullName =
      String(
        req.body?.full_name || ''
      ).trim();

    const email =
      String(
        req.body?.email || ''
      )
      .trim()
      .toLowerCase();

    const password =
      String(
        req.body?.password || ''
      );

    const inviteToken =
      req.body?.invite_token
        ? String(
            req.body.invite_token
          ).trim()
        : null;


    /* -------------------------------------------------------
       Validation
       ------------------------------------------------------- */

    if (
      !fullName ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Full name, email and password are required.'
      });
    }


    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message:
          'Please provide a valid email address.'
      });
    }


    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          'Password must be at least 8 characters.'
      });
    }


    const client =
      await pool.connect();


    try {

      await client.query(
        'BEGIN'
      );


      /* ---------------------------------------------------
         Check whether account already exists
         --------------------------------------------------- */

      const existing =
        await client.query(
          `
            SELECT
              id,
              email
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
          `,
          [email]
        );


      if (existing.rowCount) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          success: false,
          message:
            'An account with that email already exists.'
        });
      }


      let role = 'user';
      let invitation = null;


      /* ---------------------------------------------------
         Validate invitation token
         --------------------------------------------------- */

      if (inviteToken) {

        const inviteResult =
          await client.query(
            `
              SELECT
                id,
                token,
                role,
                circle_id,
                invited_name,
                invited_email,
                expires_at,
                active,
                used_count,
                max_uses

              FROM invite_tokens

              WHERE token = $1
                AND active = TRUE
                AND used_count < max_uses
                AND (
                  expires_at IS NULL
                  OR expires_at > NOW()
                )

              LIMIT 1

              FOR UPDATE
            `,
            [inviteToken]
          );


        if (!inviteResult.rowCount) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            success: false,
            message:
              'That invitation token is invalid or expired.'
          });
        }


        invitation =
          inviteResult.rows[0];

        role =
          invitation.role;


        /* -----------------------------------------------
           Make sure the invited email matches.
           ----------------------------------------------- */

        if (
          invitation.invited_email &&
          String(
            invitation.invited_email
          ).trim().toLowerCase() !== email
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(403).json({
            success: false,
            message:
              'This invitation was issued for a different email address.'
          });
        }
      }


      /* ---------------------------------------------------
         Hash password
         --------------------------------------------------- */

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      /* ---------------------------------------------------
         Create user account
         --------------------------------------------------- */

      const userResult =
        await client.query(
          `
            INSERT INTO users (
              full_name,
              email,
              password_hash,
              role,
              invite_token_used
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5
            )

            RETURNING
              id,
              full_name,
              email,
              role,
              is_super_admin,
              status,
              created_at,
              updated_at,
              last_login_at
          `,
          [
            fullName,
            email,
            passwordHash,
            role,
            inviteToken
          ]
        );


      const user =
        userResult.rows[0];


      /* ---------------------------------------------------
         Create empty profile
         --------------------------------------------------- */

      await client.query(
        `
          INSERT INTO user_profiles (
            user_id
          )

          VALUES ($1)

          ON CONFLICT (user_id)
          DO NOTHING
        `,
        [user.id]
      );


      /* ---------------------------------------------------
         Invitation acceptance
         --------------------------------------------------- */

      if (invitation) {

        /*
         * A normal user invitation joins the user
         * to the inviter's circle.
         */

        if (
          invitation.role === 'user' &&
          invitation.circle_id
        ) {

          const membership =
            await client.query(
              `
                UPDATE circle_members

                SET
                  user_id = $1,
                  status = 'active',
                  joined_at = NOW()

                WHERE invitation_token_id = $2
                  AND circle_id = $3
                  AND status = 'invited'

                RETURNING
                  id,
                  circle_id,
                  user_id,
                  status,
                  joined_at
              `,
              [
                user.id,
                invitation.id,
                invitation.circle_id
              ]
            );


          if (!membership.rowCount) {

            await client.query(
              'ROLLBACK'
            );

            return res.status(500).json({
              success: false,
              message:
                'The invitation was valid, but its circle membership could not be completed.'
            });
          }


          /* ---------------------------------------------
             Find circle owner
             --------------------------------------------- */

          const ownerResult =
            await client.query(
              `
                SELECT
                  owner_user_id,
                  name
                FROM circles
                WHERE id = $1
                LIMIT 1
              `,
              [invitation.circle_id]
            );


          if (ownerResult.rowCount) {

            const ownerId =
              ownerResult.rows[0]
                .owner_user_id;


            /*
             * Notify the owner that the invited person
             * has joined.
             */

            await client.query(
              `
                INSERT INTO notifications (
                  user_id,
                  actor_user_id,
                  type,
                  title,
                  message,
                  related_id
                )

                VALUES (
                  $1,
                  $2,
                  'invitation_accepted',
                  'Circle invitation accepted',
                  $3,
                  $4
                )
              `,
              [
                ownerId,
                user.id,
                `${fullName} joined your NALSAFE circle.`,
                invitation.id
              ]
            );
          }
        }


        /* ---------------------------------------------
           Consume the invitation.
           --------------------------------------------- */

        await client.query(
          `
            UPDATE invite_tokens

            SET
              used_count = used_count + 1,

              active =
                CASE
                  WHEN used_count + 1 >= max_uses
                    THEN FALSE
                  ELSE active
                END

            WHERE id = $1
          `,
          [invitation.id]
        );
      }


      /* ---------------------------------------------------
         Normal signup:
         create a personal NALSAFE circle.
         --------------------------------------------------- */

      if (
        !invitation &&
        role === 'user'
      ) {

        await client.query(
          `
            INSERT INTO circles (
              name,
              owner_user_id
            )

            VALUES (
              $1,
              $2
            )

            ON CONFLICT (owner_user_id)
            DO NOTHING
          `,
          [
            `${fullName}'s circle`,
            user.id
          ]
        );
      }


      await client.query(
        'COMMIT'
      );


      /* ---------------------------------------------------
         Authenticate the newly-created user
         --------------------------------------------------- */

      const token =
        signToken(user);


      setAuthCookie(
        res,
        token
      );


      return res.status(201).json({
        success: true,

        message:
          invitation
            ? 'Account created and invitation accepted successfully.'
            : 'Account created successfully.',

        user:
          publicUser(user),

        token,

        invitation_accepted:
          Boolean(invitation)
      });


    } catch (error) {

      await client.query(
        'ROLLBACK'
      );

      console.error(
        'Signup error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to create your account right now.'
      });

    } finally {

      client.release();

    }
  }
);


/* =========================================================
   LOGIN
   ========================================================= */

router.post(
  '/forgot-password',
  async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      return res.status(503).json({
        success: false,
        message: 'Password recovery is temporarily unavailable. Please contact support.'
      });
    }

    const userResult = await query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );

    if (!userResult.rowCount) {
      return res.json({
        success: true,
        message: 'If an account exists for that email, a password reset link will be sent.'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
      await query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [tokenHash, userResult.rows[0].id]
      );
      await sendPasswordResetEmail(userResult.rows[0].email, token);
      await query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND token_hash <> $2 AND used_at IS NULL`,
        [userResult.rows[0].id, tokenHash]
      );

      return res.json({
        success: true,
        message: 'If an account exists for that email, a password reset link will be sent.'
      });
    } catch (error) {
      await query(
        'DELETE FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL',
        [tokenHash]
      );

      if (error.code === 'EMAIL_NOT_CONFIGURED') {
        return res.status(503).json({
          success: false,
          message: 'Password recovery is temporarily unavailable. Please contact support.'
        });
      }

      console.error('Password recovery request error:', error);
      return res.status(502).json({
        success: false,
        message: 'We could not send a password reset email. Please try again later.'
      });
    }
  }
);

router.post(
  '/reset-password',
  async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'A reset link and new password are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id`,
        [tokenHash]
      );

      if (!tokenResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'This password reset link is invalid or has expired. Request a new one.'
        });
      }

      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, tokenResult.rows[0].user_id]
      );
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = COALESCE(used_at, NOW())
         WHERE user_id = $1 AND used_at IS NULL`,
        [tokenResult.rows[0].user_id]
      );

      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'Your password has been changed. You can now sign in.'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Password reset error:', error);
      return res.status(500).json({
        success: false,
        message: 'Unable to reset your password right now.'
      });
    } finally {
      client.release();
    }
  }
);

router.post(
  '/login',
  async (req, res) => {

    try {

      const email =
        String(
          req.body?.email || ''
        )
        .trim()
        .toLowerCase();

      const password =
        String(
          req.body?.password || ''
        );


      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message:
            'Email and password are required.'
        });
      }


      const result =
        await query(
          `
            SELECT
              id,
              full_name,
              email,
              password_hash,
              role,
              is_super_admin,
              status,
              created_at,
              updated_at,
              last_login_at

            FROM users

            WHERE LOWER(email) = LOWER($1)

            LIMIT 1
          `,
          [email]
        );


      const user =
        result.rows[0];


      if (
        !user ||
        !(await bcrypt.compare(
          password,
          user.password_hash
        ))
      ) {

        return res.status(401).json({
          success: false,
          message:
            'Invalid email or password.'
        });
      }


      if (
        user.status !== 'active'
      ) {

        return res.status(403).json({
          success: false,
          message:
            'Your account has been suspended.'
        });
      }


      /* ---------------------------------------------------
         Update last login
         --------------------------------------------------- */

      const loginResult =
        await query(
          `
            UPDATE users

            SET
              last_login_at = NOW()

            WHERE id = $1

            RETURNING
              id,
              full_name,
              email,
              role,
              is_super_admin,
              status,
              created_at,
              updated_at,
              last_login_at
          `,
          [user.id]
        );


      const loggedInUser =
        loginResult.rows[0];


      /* ---------------------------------------------------
         Make sure every normal user has a circle.
         --------------------------------------------------- */

      if (
        loggedInUser.role === 'user'
      ) {
        await getOrCreateCircle(
          loggedInUser.id
        );
      }


      const token =
        signToken(
          loggedInUser
        );


      setAuthCookie(
        res,
        token
      );


      return res.json({
        success: true,

        message:
          'Signed in successfully.',

        user:
          publicUser(
            loggedInUser
          ),

        token
      });

    } catch (error) {

      console.error(
        'Login error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to sign you in right now.'
      });
    }
  }
);


/* =========================================================
   CURRENT USER
   ========================================================= */

router.get(
  '/me',
  requireAuth,
  async (req, res) => {

    try {

      const profile =
        await query(
          `
            SELECT
              phone,
              country,
              date_of_birth,
              bio,
              avatar_url

            FROM user_profiles

            WHERE user_id = $1

            LIMIT 1
          `,
          [req.user.id]
        );


      return res.json({
        success: true,

        user:
          publicUser(
            req.user
          ),

        profile:
          profile.rows[0] ||
          null
      });

    } catch (error) {

      console.error(
        'Current user error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load your account information.'
      });
    }
  }
);


/* =========================================================
   INVITATION PREVIEW
   =========================================================

   GET /api/invitations/:token

   Used by your signup page to display the invitation
   before the invited person creates their account.
   ========================================================= */

router.get(
  '/invitations/:token',
  async (req, res) => {

    try {

      const token =
        String(
          req.params.token || ''
        ).trim();


      if (!token) {
        return res.status(400).json({
          success: false,
          message:
            'Invitation token is required.'
        });
      }


      const result =
        await query(
          `
            SELECT
              it.token,
              it.role,
              it.invited_name,
              it.invited_email,
              it.expires_at,
              it.active,
              it.used_count,
              it.max_uses,

              c.name AS circle_name

            FROM invite_tokens it

            LEFT JOIN circles c
              ON c.id = it.circle_id

            WHERE it.token = $1

            LIMIT 1
          `,
          [token]
        );


      if (!result.rowCount) {
        return res.status(404).json({
          success: false,
          message:
            'Invitation not found.'
        });
      }


      const invitation =
        result.rows[0];


      const expired =
        invitation.expires_at &&
        new Date(
          invitation.expires_at
        ) <= new Date();


      const available =
        invitation.active &&
        !expired &&
        invitation.used_count <
          invitation.max_uses;


      if (!available) {
        return res.status(400).json({
          success: false,
          message:
            'This invitation is no longer valid.'
        });
      }


      return res.json({
        success: true,

        invitation: {
          role:
            invitation.role,

          invited_name:
            invitation.invited_name,

          invited_email:
            invitation.invited_email,

          circle_name:
            invitation.circle_name,

          expires_at:
            invitation.expires_at
        }
      });

    } catch (error) {

      console.error(
        'Invitation lookup error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to check this invitation right now.'
      });
    }
  }
);


/* =========================================================
   LOGOUT
   ========================================================= */

router.post(
  '/logout',
  (_req, res) => {

    const cookieName =
      process.env.COOKIE_NAME ||
      'nalsafe_token';


    res.clearCookie(
      cookieName,
      {
        path: '/'
      }
    );


    return res.json({
      success: true,
      message:
        'Signed out successfully.'
    });
  }
);


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = router;