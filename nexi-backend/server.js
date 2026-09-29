require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing from your .env file");
  process.exit(1);
}

const sql = require("./lib/db");
const authRoutes = require("./routes/auth");
const allowedOrigins = new Set((process.env.FRONTEND_ORIGINS || "http://localhost:4173,http://127.0.0.1:4173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean));

// Middleware
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true
}));
app.use(express.json({ limit: "16kb" }));
app.use("/api", authRoutes);

// Homepage test
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Nexi backend is running"
  });
});

// Database test
app.get("/api/test", async (req, res) => {
  try {
    const result = await sql`
      SELECT NOW() AS current_time
    `;

    res.json({
      success: true,
      message: "Nexi backend is connected to Neon PostgreSQL",
      databaseTime: result[0].current_time
    });

  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(70) NOT NULL,
      email VARCHAR(320) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email))`;
  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions (expires_at)`;
  await sql`DELETE FROM user_sessions WHERE expires_at <= NOW()`;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexi backend running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Backend startup failed:", error.message);
  process.exit(1);
});