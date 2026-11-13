const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validate } = require("../middleware/validate");
const { registerSchema, loginSchema } = require("../validators/schemas");
const db = require("../db");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

function createToken(user) {
  return jwt.sign({ email: user.email }, JWT_SECRET, {
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
}

/**
 * POST /api/auth/register
 * Register a new user; returns the user object and a JWT.
 * Passwords are hashed with bcrypt (cost factor 12) before storage.
 */
router.post("/register", validate(registerSchema), (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const exists = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);
    if (exists)
      return res.status(409).json({ error: "Email is already registered" });

    const passwordHash = bcrypt.hashSync(password, 12);
    const result = db
      .prepare(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)"
      )
      .run(name, email, passwordHash);

    const user = db
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    return res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate with email + password; returns user and a fresh JWT.
 */
router.post("/login", validate(loginSchema), (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = db
      .prepare(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?"
      )
      .get(email);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      user: { id: user.id, name: user.name, email: user.email },
      token: createToken(user),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
