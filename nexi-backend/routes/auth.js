const express = require("express");
const bcrypt = require("bcryptjs");
const sql = require("../lib/db");

const router = express.Router();

// POST /api/signup
router.post("/signup", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    // Basic validation
    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required."
      });
    }

    const cleanName = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid full name."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    // Check whether email already exists
    const existingUser = await sql`
      SELECT id
      FROM users
      WHERE LOWER(email) = ${cleanEmail}
      LIMIT 1
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Save user
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

    res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: newUser[0]
    });

  } catch (error) {
    console.error("Signup error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create account."
    });
  }
});

module.exports = router;