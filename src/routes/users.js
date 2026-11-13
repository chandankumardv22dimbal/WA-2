const express = require("express");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

/**
 * GET /api/users/me
 * Returns the profile of the currently authenticated user (no password data).
 */
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
