require("dotenv").config();

const express = require("express");
const cors = require("cors");

const sql = require("./lib/db");
const authRoutes = require("./routes/auth");

const app = express();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing from your .env file");
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
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

// Authentication routes
app.use("/api", authRoutes);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Nexi backend running on http://localhost:${PORT}`);
});