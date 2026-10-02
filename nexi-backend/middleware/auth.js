const jwt = require('jsonwebtoken');
const { query } = require('../db');

/* =========================================================
TOKEN EXTRACTION
========================================================= */

function getToken(req) {
const authHeader =
req.get('authorization');

/*

* Preferred API authentication:
*
* Authorization: Bearer <token>
  */
  if (
  authHeader &&
  authHeader
  .toLowerCase()
  .startsWith('bearer ')
  ) {
  const token =
  authHeader
  .slice(7)
  .trim();

```
if (token) {
```

```
  return token;
}
```

}

/*

* Fallback:
* authentication cookie.
  */
  const cookieName =
  process.env.COOKIE_NAME ||
  'nexi_token';

return (
req.cookies?.[cookieName] ||
null
);
}

/* =========================================================
AUTHENTICATED USER
========================================================= */

async function requireAuth(
req,
res,
next
) {
const token =
getToken(req);

if (!token) {
return res.status(401).json({
success: false,
message:
'Authentication required.'
});
}

try {

```
/* -----------------------------------------------------
   Verify JWT
   ----------------------------------------------------- */

const payload =
  jwt.verify(
    token,
    process.env.JWT_SECRET
  );


if (!payload?.sub) {
  return res.status(401).json({
    success: false,
    message:
      'Your session is invalid or has expired.'
  });
}


/* -----------------------------------------------------
   Retrieve current user from database
   ----------------------------------------------------- */

const result =
  await query(
    `
      SELECT
        id,
        full_name,
        email,
        role,
        status,
        created_at,
        updated_at,
        last_login_at

      FROM users

      WHERE id = $1

      LIMIT 1
    `,
    [payload.sub]
  );


const user =
  result.rows[0];


if (!user) {
  return res.status(401).json({
    success: false,
    message:
      'Your account could not be found.'
  });
}


/* -----------------------------------------------------
   Check current account status
   ----------------------------------------------------- */

if (
  user.status !== 'active'
) {
  return res.status(401).json({
    success: false,
    message:
      'Your account is not active.'
  });
}


/*
 * IMPORTANT:
 * The database is the source of truth for the
 * user's current role.
 *
 * req.user.role therefore remains accurate even
 * if an administrator changes it after the JWT
 * was originally created.
 */


req.user = user;

/*
 * Preserve decoded JWT information when useful.
 */
req.auth = payload;


return next();
```

} catch (error) {

```
if (
  error.name ===
  'TokenExpiredError'
) {
  return res.status(401).json({
    success: false,
    message:
      'Your session has expired. Please sign in again.',
    code: 'TOKEN_EXPIRED'
  });
}


if (
  error.name ===
  'JsonWebTokenError'
) {
  return res.status(401).json({
    success: false,
    message:
      'Your session is invalid. Please sign in again.',
    code: 'TOKEN_INVALID'
  });
}


console.error(
  'Authentication middleware error:',
  error
);


return res.status(401).json({
  success: false,
  message:
    'Unable to verify your session.'
});
```

}
}

/* =========================================================
ADMIN AUTHORIZATION
========================================================= */

function requireAdmin(
req,
res,
next
) {
if (
!req.user ||
req.user.role !== 'admin'
) {
return res.status(403).json({
success: false,
message:
'Administrator access required.'
});
}

return next();
}

/* =========================================================
EXPORTS
========================================================= */

module.exports = {
getToken,
requireAuth,
requireAdmin
};
