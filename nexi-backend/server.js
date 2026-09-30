require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { checkDatabase } = require('./db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured. Add it to your .env file.');
}

const app = express();
const port = Number(process.env.PORT || 5000);

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

app.get('/', (_req, res) => {
  res.json({ success: true, service: 'Nexi backend', status: 'online' });
});

app.get('/health', async (_req, res) => {
  try {
    const databaseTime = await checkDatabase();
    return res.json({ success: true, message: 'Nexi backend is connected to Neon PostgreSQL', databaseTime });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({ success: false, message: 'Backend is online but the database connection failed.' });
  }
});

// The current nexi-api.js builds URLs as /api/signup, /api/login, /api/me and /api/logout.
// Keep those exact routes, plus /signup and /api/auth/* aliases for compatibility.
app.use('/api', authRoutes);
app.use('/', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error:', error);
  if (error.message === 'CORS origin not allowed') {
    return res.status(403).json({ success: false, message: 'Request origin is not allowed.' });
  }
  return res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(port, () => {
  console.log(`Nexi backend listening on port ${port}`);
});
