require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { checkDatabase } = require('./db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

/* =========================================================
ENVIRONMENT VALIDATION
========================================================= */

if (!process.env.JWT_SECRET) {
throw new Error(
'JWT_SECRET is not configured. Add it to your environment variables.'
);
}

const app = express();

const port = Number(process.env.PORT || 5000);

/* =========================================================
CORS
========================================================= */

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(
cors({
origin(origin, callback) {
/*
* Requests without an Origin header can be:
* - server-to-server calls
* - health checks
* - curl/Postman
*/
if (!origin) {
return callback(null, true);
}


  const normalizedOrigin = origin
    .trim()
    .replace(/\/+$/, '');

  /*
   * During development, allow requests when
   * FRONTEND_URL has not yet been configured.
   */
  if (
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(normalizedOrigin)
  ) {
    return callback(null, true);
  }

  return callback(
    new Error('CORS origin not allowed')
  );
},

credentials: true,

methods: [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS'
],

allowedHeaders: [
  'Content-Type',
  'Authorization'
]


})
);

/* =========================================================
BODY PARSERS
========================================================= */

app.use(
express.json({
limit: '1mb'
})
);

app.use(
express.urlencoded({
extended: true,
limit: '1mb'
})
);

app.use(cookieParser());

/* =========================================================
BASIC SERVICE ROUTES
========================================================= */

app.get('/', (_req, res) => {
return res.json({
success: true,
service: 'Nexi backend',
status: 'online'
});
});

app.get('/health', async (_req, res) => {
try {
const databaseTime = await checkDatabase();


return res.json({
  success: true,
  message:
    'Nexi backend is connected to Neon PostgreSQL',
  databaseTime
});


} catch (error) {
console.error(
'Health check error:',
error
);


return res.status(503).json({
  success: false,
  message:
    'Backend is online but the database connection failed.'
});


}
});

/* =========================================================
AUTH ROUTES
===========

Supported examples:

/api/signup
/api/login
/api/me
/api/logout

Compatibility aliases are retained.
========================================================= */

app.use('/api', authRoutes);

/*

* Existing root-level compatibility.
  */
  app.use('/', authRoutes);

/*

* Authentication namespace compatibility.
  */
  app.use('/api/auth', authRoutes);

/* =========================================================
USER ROUTES
===========

IMPORTANT:

The frontend dashboard currently calls:

/api/dashboard
/api/checkins
/api/checkins/today
/api/reminder
/api/circle/invitations

Therefore userRoutes MUST also be mounted at /api.

Example:

router.get('/dashboard', ...)
becomes
GET /api/dashboard

router.post('/checkins', ...)
becomes
POST /api/checkins

router.put('/reminder', ...)
becomes
PUT /api/reminder
========================================================= */

app.use('/api', userRoutes);

/*

* Retain the existing /api/users namespace
* for compatibility with any existing frontend
* or future API consumers.
  */
  app.use('/api/users', userRoutes);

/* =========================================================
ADMIN ROUTES
========================================================= */

app.use('/api/admin', adminRoutes);

/* =========================================================
API 404 HANDLER
========================================================= */

app.use((req, res) => {
return res.status(404).json({
success: false,
message: 'Endpoint not found.',
path: req.originalUrl
});
});

/* =========================================================
GLOBAL ERROR HANDLER
========================================================= */

app.use(
(error, _req, res, _next) => {
console.error(
'Unhandled server error:',
error
);


if (
  error.message ===
  'CORS origin not allowed'
) {
  return res.status(403).json({
    success: false,
    message:
      'Request origin is not allowed.'
  });
}

return res.status(500).json({
  success: false,
  message:
    'Internal server error.'
});


}
);

/* =========================================================
START SERVER
========================================================= */

app.listen(port, () => {
console.log(
`Nexi backend listening on port ${port}`
);

console.log(
`API base URL: http://localhost:${port}/api`
);

if (allowedOrigins.length) {
console.log(
`Allowed frontend origins: ${allowedOrigins.join(', ')}`
);
} else {
console.log(
'FRONTEND_URL is not configured; cross-origin requests are currently unrestricted.'
);
}
});
