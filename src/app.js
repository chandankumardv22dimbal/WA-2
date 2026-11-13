"use strict";

const express = require("express");

// Route modules
const authRouter = require("./routes/auth");
const tasksRouter = require("./routes/tasks");
const usersRouter = require("./routes/users");

const app = express();

// ── Global middleware ──────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

/** API info — lists all available endpoints, no auth required. */
app.get("/", (_req, res) =>
  res.json({
    name: "Task CRUD API",
    version: "1.0.0",
    endpoints: {
      health:   "GET  /health",
      register: "POST /api/auth/register",
      login:    "POST /api/auth/login",
      me:       "GET  /api/users/me          🔒",
      tasks: {
        list:   "GET    /api/tasks           🔒  ?completed=true|false&page=1&limit=20",
        create: "POST   /api/tasks           🔒",
        get:    "GET    /api/tasks/:id       🔒",
        update: "PUT    /api/tasks/:id       🔒",
        delete: "DELETE /api/tasks/:id       🔒",
      },
    },
  })
);

/** Health-check — no auth required. */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/users", usersRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ── Global error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
