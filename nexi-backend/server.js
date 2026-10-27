require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const {
  checkDatabase,
  initializeSchema
} = require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const adminRoutes = require("./routes/admin");
const adminDashboardRoutes = require("./routes/admin-live");

// =========================================================
// ENVIRONMENT VALIDATION
// =========================================================

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not configured. Add it to your environment variables."
  );
}

const app = express();

const port = Number(process.env.PORT) || 5000;

// =========================================================
// CORS CONFIGURATION
// =========================================================

const normalizeOrigin = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as
      // server-to-server requests and command-line health checks.
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = normalizeOrigin(origin);

      // During initial setup, allow cross-origin requests when
      // FRONTEND_URL has not yet been configured.
      // Configure FRONTEND_URL in Render before commercial launch.
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.warn(
        `CORS blocked request from origin: ${normalizedOrigin}`
      );

      return callback(new Error("CORS origin not allowed"));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ],

    optionsSuccessStatus: 204
  })
);

// =========================================================
// BODY PARSERS AND COOKIES
// =========================================================

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

app.use(cookieParser());

// =========================================================
// BASIC SERVICE ROUTES
// =========================================================

// Public root endpoint.
app.get("/", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "NALSAFE backend",
    status: "online"
  });
});

// Lightweight liveness check for Render.
// This does not depend on the database connection.
app.get("/health/live", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "NALSAFE backend",
    status: "online",
    timestamp: new Date().toISOString()
  });
});

// Database health check.
app.get("/health", async (_req, res) => {
  try {
    const databaseTime = await checkDatabase();

    return res.status(200).json({
      success: true,
      message:
        "NALSAFE backend is connected to Neon PostgreSQL",
      databaseTime
    });
  } catch (error) {
    console.error("Health check database error:", error);

    return res.status(503).json({
      success: false,
      message:
        "Backend is online, but the database connection failed."
    });
  }
});

// =========================================================
// AUTHENTICATION ROUTES
// =========================================================

// Primary API endpoints:
// POST /api/signup
// POST /api/login
// GET  /api/me
// POST /api/logout

app.use("/api", authRoutes);

// Retain existing root-level compatibility routes.
app.use("/", authRoutes);

// Retain /api/auth compatibility routes.
app.use("/api/auth", authRoutes);

// =========================================================
// USER ROUTES
// =========================================================

// Existing frontend endpoints may include:
// GET  /api/dashboard
// GET  /api/checkins
// POST /api/checkins
// GET  /api/checkins/today
// PUT  /api/reminder
// POST /api/circle/invitations

app.use("/api", userRoutes);

// Retain the /api/users namespace for compatibility.
app.use("/api/users", userRoutes);

// =========================================================
// ADMIN ROUTES
// =========================================================

app.use("/api/admin", adminRoutes);

app.use("/api/admin", adminDashboardRoutes);

// =========================================================
// API NOT FOUND HANDLER
// =========================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Endpoint not found.",
    path: req.originalUrl
  });
});

// =========================================================
// GLOBAL ERROR HANDLER
// =========================================================

app.use((error, _req, res, _next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return;
  }

  if (error.message === "CORS origin not allowed") {
    return res.status(403).json({
      success: false,
      message: "Request origin is not allowed."
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error."
  });
});

// =========================================================
// START SERVER
// =========================================================

async function startServer() {
  try {
    console.log("Initializing NALSAFE backend...");

    // Initialize the database schema before accepting requests.
    await initializeSchema();

    console.log("Database schema initialization completed.");

    const server = app.listen(port, "0.0.0.0", () => {
      console.log(
        `NALSAFE backend listening on port ${port}`
      );

      console.log("Liveness endpoint: /health/live");
      console.log("Database health endpoint: /health");
      console.log("API routes mounted at /api");

      if (allowedOrigins.length > 0) {
        console.log(
          `Allowed frontend origins: ${allowedOrigins.join(", ")}`
        );
      } else {
        console.warn(
          "FRONTEND_URL is not configured. " +
          "Cross-origin requests are currently unrestricted."
        );
      }
    });

    server.on("error", (error) => {
      console.error("NALSAFE server failed to listen:", error);
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error(
      "NALSAFE backend startup failed:",
      error
    );

    process.exit(1);
  }
}

startServer();