const express = require('express');
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
HELPERS
========================================================= */

async function getOrCreateCircle(userId, client = null) {
const db = client || { query };

await db.query(
`       INSERT INTO circles (name, owner_user_id)
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

const result = await db.query(
`       SELECT
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

return result.rows[0] || null;
}

function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    'http://localhost:3000'
  )
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
}

function isTodayNairobi(column = 'created_at') {
return `     (
      (${column} AT TIME ZONE 'Africa/Nairobi')::date =
      (NOW() AT TIME ZONE 'Africa/Nairobi')::date
    )
  `;
}

/* =========================================================
PROFILE
========================================================= */

router.get(
'/profile',
requireAuth,
async (req, res) => {
const result = await query(
`         SELECT
          u.id,
          u.full_name,
          u.email,
          u.role,
          u.status,
          u.created_at,
          p.phone,
          p.country,
          p.date_of_birth,
          p.bio,
          p.avatar_url
        FROM users u
        LEFT JOIN user_profiles p
          ON p.user_id = u.id
        WHERE u.id = $1
      `,
[req.user.id]
);


if (!result.rows.length) {
  return res.status(404).json({
    success: false,
    message: 'User profile could not be found.'
  });
}

return res.json({
  success: true,
  user: result.rows[0]
});


}
);

router.put(
'/profile',
requireAuth,
async (req, res) => {
const fullName = String(
req.body?.full_name ??
req.user.full_name ??
''
).trim();


const phone =
  req.body?.phone ?? null;

const country =
  req.body?.country ?? null;

const dateOfBirth =
  req.body?.date_of_birth || null;

const bio =
  req.body?.bio ?? null;

const avatarUrl =
  req.body?.avatar_url ?? null;


if (!fullName) {
  return res.status(400).json({
    success: false,
    message:
      'Full name cannot be empty.'
  });
}


const client =
  await pool.connect();

try {
  await client.query('BEGIN');

  await client.query(
    `
      UPDATE users
      SET full_name = $1
      WHERE id = $2
    `,
    [
      fullName,
      req.user.id
    ]
  );


  await client.query(
    `
      INSERT INTO user_profiles (
        user_id,
        phone,
        country,
        date_of_birth,
        bio,
        avatar_url
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )

      ON CONFLICT (user_id)
      DO UPDATE SET
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        date_of_birth = EXCLUDED.date_of_birth,
        bio = EXCLUDED.bio,
        avatar_url = EXCLUDED.avatar_url
    `,
    [
      req.user.id,
      phone,
      country,
      dateOfBirth,
      bio,
      avatarUrl
    ]
  );


  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}


const result = await query(
  `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.role,
      u.status,
      u.created_at,
      p.phone,
      p.country,
      p.date_of_birth,
      p.bio,
      p.avatar_url
    FROM users u
    LEFT JOIN user_profiles p
      ON p.user_id = u.id
    WHERE u.id = $1
  `,
  [req.user.id]
);


return res.json({
  success: true,
  message:
    'Profile updated successfully.',
  user: result.rows[0]
});


}
);

/* =========================================================
USER DASHBOARD
========================================================= */

router.get(
'/dashboard',
requireAuth,
async (req, res) => {
const circle =
await getOrCreateCircle(req.user.id);


if (!circle) {
  return res.status(500).json({
    success: false,
    message:
      'Your Nexi circle could not be created.'
  });
}


const [
  membersResult,
  checkinsResult,
  activityResult,
  reminderResult,
  notificationsResult
] = await Promise.all([

  /* Circle members */
  query(
    `
      SELECT
        cm.id,
        cm.user_id AS member_user_id,
        COALESCE(
          u.full_name,
          cm.invited_name
        ) AS full_name,

        COALESCE(
          u.email,
          cm.invited_email
        ) AS email,

        cm.status,
        cm.joined_at,
        cm.created_at

      FROM circle_members cm

      LEFT JOIN users u
        ON u.id = cm.user_id

      WHERE cm.circle_id = $1
        AND cm.status <> 'removed'

      ORDER BY
        CASE
          WHEN cm.status = 'active'
            THEN 0
          ELSE 1
        END,
        COALESCE(
          u.full_name,
          cm.invited_name
        ) ASC
    `,
    [circle.id]
  ),


  /* Recent circle check-ins */
  query(
    `
      SELECT
        c.id,
        c.user_id,
        c.status,
        c.note,
        c.created_at
      FROM checkins c
      WHERE c.circle_id = $1
        AND c.created_at >= NOW() - INTERVAL '14 days'
      ORDER BY c.created_at DESC
      LIMIT 200
    `,
    [circle.id]
  ),


  /* Current user's activity */
  query(
    `
      SELECT
        id,
        user_id,
        status,
        note,
        created_at
      FROM checkins
      WHERE circle_id = $1
        AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [
      circle.id,
      req.user.id
    ]
  ),


  /* Reminder */
  query(
    `
      SELECT
        enabled,
        TO_CHAR(
          reminder_time,
          'HH24:MI'
        ) AS time,
        timezone
      FROM reminders
      WHERE user_id = $1
      LIMIT 1
    `,
    [req.user.id]
  ),


  /* Notifications */
  query(
    `
      SELECT
        id,
        type,
        title,
        message,
        related_id,
        read_at,
        created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [req.user.id]
  )

]);


const reminder =
  reminderResult.rows[0] || {
    enabled: false,
    time: '19:00',
    timezone: 'Africa/Nairobi'
  };


return res.json({
  success: true,

  circle: {
    id: circle.id,
    name: circle.name
  },

  members:
    membersResult.rows,

  checkins:
    checkinsResult.rows,

  activity:
    activityResult.rows,

  reminder,

  notifications:
    notificationsResult.rows
});


}
);

/* =========================================================
CREATE CHECK-IN
========================================================= */

router.post(
'/checkins',
requireAuth,
async (req, res) => {
const status =
String(
req.body?.status || ''
).trim().toLowerCase();


const note =
  req.body?.note
    ? String(req.body.note).trim().slice(0, 1000)
    : null;


if (!['safe', 'support'].includes(status)) {
  return res.status(400).json({
    success: false,
    message:
      'Check-in status must be either safe or support.'
  });
}


const circle =
  await getOrCreateCircle(req.user.id);

if (!circle) {
  return res.status(500).json({
    success: false,
    message:
      'Your Nexi circle could not be found.'
  });
}


const client =
  await pool.connect();

try {
  await client.query('BEGIN');


  const result =
    await client.query(
      `
        INSERT INTO checkins (
          circle_id,
          user_id,
          status,
          note
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING
          id,
          circle_id,
          user_id,
          status,
          note,
          created_at
      `,
      [
        circle.id,
        req.user.id,
        status,
        note
      ]
    );


  const checkin =
    result.rows[0];


  /*
   * Notify active circle members.
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

      SELECT
        cm.user_id,
        $2,

        CASE
          WHEN $3 = 'support'
            THEN 'support_checkin'
          ELSE 'safe_checkin'
        END,

        CASE
          WHEN $3 = 'support'
            THEN 'Support check-in'
          ELSE 'Circle check-in'
        END,

        CASE
          WHEN $3 = 'support'
            THEN CONCAT(
              $4,
              ' saved a support check-in.'
            )
          ELSE CONCAT(
            $4,
            ' checked in as safe.'
          )
        END,

        $1

      FROM circle_members cm

      WHERE cm.circle_id = $5
        AND cm.status = 'active'
        AND cm.user_id IS NOT NULL
        AND cm.user_id <> $2
    `,
    [
      checkin.id,
      req.user.id,
      status,
      req.user.full_name,
      circle.id
    ]
  );


  await client.query('COMMIT');


  return res.status(201).json({
    success: true,
    message:
      status === 'safe'
        ? 'Your safe check-in has been saved.'
        : 'Your support check-in has been saved.',
    checkin
  });

} catch (error) {
  await client.query('ROLLBACK');
  throw error;

} finally {
  client.release();
}


}
);

/* =========================================================
DELETE TODAY'S CHECK-IN
========================================================= */

router.delete(
'/checkins/today',
requireAuth,
async (req, res) => {
const circle =
await getOrCreateCircle(req.user.id);


if (!circle) {
  return res.status(500).json({
    success: false,
    message:
      'Your Nexi circle could not be found.'
  });
}


const result =
  await query(
    `
      DELETE FROM checkins
      WHERE circle_id = $1
        AND user_id = $2
        AND ${isTodayNairobi('created_at')}
    `,
    [
      circle.id,
      req.user.id
    ]
  );


return res.json({
  success: true,
  message:
    result.rowCount
      ? "Today's check-in was cleared."
      : "You did not have a check-in for today."
});


}
);

/* =========================================================
UPDATE REMINDER
========================================================= */

router.put(
'/reminder',
requireAuth,
async (req, res) => {
const enabled =
Boolean(req.body?.enabled);


const rawTime =
  String(
    req.body?.time || '19:00'
  ).trim();


if (!/^\d{2}:\d{2}$/.test(rawTime)) {
  return res.status(400).json({
    success: false,
    message:
      'Reminder time must use HH:MM format.'
  });
}


const [hours, minutes] =
  rawTime.split(':').map(Number);


if (
  hours < 0 ||
  hours > 23 ||
  minutes < 0 ||
  minutes > 59
) {
  return res.status(400).json({
    success: false,
    message:
      'Reminder time is invalid.'
  });
}


const result =
  await query(
    `
      INSERT INTO reminders (
        user_id,
        enabled,
        reminder_time,
        timezone
      )
      VALUES (
        $1,
        $2,
        $3::time,
        'Africa/Nairobi'
      )

      ON CONFLICT (user_id)

      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        reminder_time = EXCLUDED.reminder_time,
        timezone = EXCLUDED.timezone

      RETURNING
        enabled,
        TO_CHAR(
          reminder_time,
          'HH24:MI'
        ) AS time,
        timezone
    `,
    [
      req.user.id,
      enabled,
      rawTime
    ]
  );


return res.json({
  success: true,
  message:
    'Reminder preference saved.',
  reminder:
    result.rows[0]
});


}
);

/* =========================================================
INVITE A CIRCLE MEMBER
========================================================= */

router.post(
'/circle/invitations',
requireAuth,
async (req, res) => {
const fullName =
String(
req.body?.full_name || ''
).trim();


const email =
  String(
    req.body?.email || ''
  ).trim()
  .toLowerCase();


if (!fullName) {
  return res.status(400).json({
    success: false,
    message:
      "The invited person's name is required."
  });
}


if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  return res.status(400).json({
    success: false,
    message:
      'Please provide a valid email address.'
  });
}


if (
  email ===
  String(req.user.email || '').toLowerCase()
) {
  return res.status(400).json({
    success: false,
    message:
      'You cannot invite yourself to your own circle.'
  });
}


const circle =
  await getOrCreateCircle(req.user.id);


if (!circle) {
  return res.status(500).json({
    success: false,
    message:
      'Your Nexi circle could not be found.'
  });
}


/*
 * Check for an existing active/pending invitation.
 */
const existing =
  await query(
    `
      SELECT
        cm.id,
        cm.status
      FROM circle_members cm
      WHERE cm.circle_id = $1
        AND LOWER(cm.invited_email) = LOWER($2)
        AND cm.status IN ('invited', 'active')
      LIMIT 1
    `,
    [
      circle.id,
      email
    ]
  );


if (existing.rows.length) {
  return res.status(409).json({
    success: false,
    message:
      existing.rows[0].status === 'active'
        ? 'This person is already in your circle.'
        : 'An invitation for this email is already pending.'
  });
}


const token =
  crypto.randomBytes(32).toString('hex');


const client =
  await pool.connect();


try {
  await client.query('BEGIN');


  const tokenResult =
    await client.query(
      `
        INSERT INTO invite_tokens (
          token,
          role,
          max_uses,
          used_count,
          expires_at,
          active,
          circle_id,
          invited_name,
          invited_email
        )
        VALUES (
          $1,
          'user',
          1,
          0,
          NOW() + INTERVAL '7 days',
          TRUE,
          $2,
          $3,
          $4
        )
        RETURNING
          id,
          token,
          expires_at
      `,
      [
        token,
        circle.id,
        fullName,
        email
      ]
    );


  const inviteToken =
    tokenResult.rows[0];


  const memberResult =
    await client.query(
      `
        INSERT INTO circle_members (
          circle_id,
          user_id,
          invited_name,
          invited_email,
          status,
          invitation_token_id
        )
        VALUES (
          $1,
          NULL,
          $2,
          $3,
          'invited',
          $4
        )
        RETURNING
          id,
          invited_name,
          invited_email,
          status,
          created_at
      `,
      [
        circle.id,
        fullName,
        email,
        inviteToken.id
      ]
    );


  await client.query('COMMIT');


  const inviteUrl =
    `${getFrontendUrl()}/login.html?mode=signup&invite=${encodeURIComponent(token)}`;


  return res.status(201).json({
    success: true,
    message:
      'Invitation created successfully.',
    invitation: {
      id: inviteToken.id,
      email,
      full_name: fullName,
      invite_url: inviteUrl,
      expires_at:
        inviteToken.expires_at,

      /*
       * Email delivery is deliberately false
       * until a mail provider is configured.
       */
      email_sent: false,

      member:
        memberResult.rows[0]
    }
  });

} catch (error) {
  await client.query('ROLLBACK');
  throw error;

} finally {
  client.release();
}


}
);

/* =========================================================
NOTIFICATIONS
========================================================= */

router.get(
'/notifications',
requireAuth,
async (req, res) => {
const result =
await query(
`           SELECT
            id,
            type,
            title,
            message,
            related_id,
            read_at,
            created_at
          FROM notifications
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 100
        `,
[req.user.id]
);


return res.json({
  success: true,
  notifications:
    result.rows
});


}
);

router.patch(
'/notifications/:id/read',
requireAuth,
async (req, res) => {
const result =
await query(
`           UPDATE notifications
          SET read_at = COALESCE(read_at, NOW())
          WHERE id = $1
            AND user_id = $2
          RETURNING
            id,
            read_at
        `,
[
req.params.id,
req.user.id
]
);


if (!result.rows.length) {
  return res.status(404).json({
    success: false,
    message:
      'Notification not found.'
  });
}


return res.json({
  success: true,
  notification:
    result.rows[0]
});


}
);

router.post(
'/notifications/read-all',
requireAuth,
async (req, res) => {
const result =
await query(
`           UPDATE notifications
          SET read_at = COALESCE(read_at, NOW())
          WHERE user_id = $1
            AND read_at IS NULL
        `,
[req.user.id]
);


return res.json({
  success: true,
  updated:
    result.rowCount
});


}
);

/* =========================================================
EXPORT
========================================================= */

module.exports = router;
