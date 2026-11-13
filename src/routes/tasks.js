const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { validate } = require("../middleware/validate");
const {
  taskCreateSchema,
  taskUpdateSchema,
  taskQuerySchema,
} = require("../validators/schemas");
const db = require("../db");

const router = express.Router();

/** Serialize a raw SQLite task row into a clean API shape. */
function serializeTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: Boolean(row.completed),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// All task routes require a valid JWT.
router.use(authenticate);

/**
 * GET /api/tasks
 * List the authenticated user's tasks.
 * Query params: completed (true|false), page (default 1), limit (default 20, max 100)
 */
router.get("/", validate(taskQuerySchema, "query"), (req, res) => {
  const { completed, page, limit } = req.query;
  const offset = (page - 1) * limit;

  let where = "WHERE user_id = ?";
  const params = [req.user.id];

  if (completed !== undefined) {
    where += " AND completed = ?";
    params.push(completed === "true" ? 1 : 0);
  }

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM tasks ${where}`)
    .get(...params);
  const rows = db
    .prepare(
      `SELECT * FROM tasks ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json({
    tasks: rows.map(serializeTask),
    pagination: {
      total: totalRow.total,
      page,
      limit,
      pages: Math.ceil(totalRow.total / limit),
    },
  });
});

/**
 * POST /api/tasks
 * Create a new task for the authenticated user.
 * Body: { title (required), description?, completed? }
 */
router.post("/", validate(taskCreateSchema), (req, res) => {
  const { title, description, completed } = req.body;
  const result = db
    .prepare(
      "INSERT INTO tasks (user_id, title, description, completed) VALUES (?, ?, ?, ?)"
    )
    .run(req.user.id, title, description, completed ? 1 : 0);

  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json({ task: serializeTask(task) });
});

/**
 * GET /api/tasks/:id
 * Fetch a single task. Returns 404 if the task doesn't exist or belongs to another user.
 */
router.get("/:id", (req, res) => {
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task: serializeTask(task) });
});

/**
 * PUT /api/tasks/:id
 * Update one or more fields of a task (partial update supported).
 * Body: at least one of { title, description, completed }
 */
router.put("/:id", validate(taskUpdateSchema), (req, res) => {
  const existing = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const data = req.body;
  const title = data.title ?? existing.title;
  const description = data.description ?? existing.description;
  const completed =
    data.completed === undefined
      ? existing.completed
      : data.completed
      ? 1
      : 0;

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, completed = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).run(title, description, completed, req.params.id, req.user.id);

  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ?")
    .get(req.params.id);
  res.json({ task: serializeTask(task) });
});

/**
 * DELETE /api/tasks/:id
 * Permanently delete a task. Returns 204 No Content on success.
 */
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (result.changes === 0)
    return res.status(404).json({ error: "Task not found" });
  res.status(204).send();
});

module.exports = router;
