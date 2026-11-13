const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-me";

/**
 * Middleware: verify Bearer token and attach req.user.
 * Returns 401 when no token is supplied or the token is invalid/expired.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticate };
