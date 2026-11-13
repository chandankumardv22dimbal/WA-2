"use strict";
/**
 * Full integration-test suite for the Task CRUD API.
 * Uses Node.js built-in test runner + fetch; no extra dependencies.
 *
 * Run:  node --test
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Use an isolated temp database so tests never touch data.sqlite.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-api-"));
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.JWT_SECRET = "test-secret-change-in-prod";

const app = require("../src/app");
const db = require("../src/db");

let server;
let baseUrl;

// ── Test lifecycle ──────────────────────────────────────────────────────────

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function req(method, route, { token, body, query } = {}) {
  const url = new URL(route, baseUrl);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// ── Health ───────────────────────────────────────────────────────────────────

test("GET /health → 200 { status: ok }", async () => {
  const r = await req("GET", "/health");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "ok" });
});

test("GET /unknown-route → 404", async () => {
  const r = await req("GET", "/does-not-exist");
  assert.equal(r.status, 404);
  assert.ok(r.body.error);
});

// ── Auth — Registration ───────────────────────────────────────────────────────

test("POST /api/auth/register → 400 on empty body", async () => {
  const r = await req("POST", "/api/auth/register", { body: {} });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Validation failed");
  assert.ok(Array.isArray(r.body.details));
});

test("POST /api/auth/register → 400 on invalid email", async () => {
  const r = await req("POST", "/api/auth/register", {
    body: { name: "Alice", email: "not-an-email", password: "password123" },
  });
  assert.equal(r.status, 400);
  const fields = r.body.details.map((d) => d.field);
  assert.ok(fields.includes("email"));
});

test("POST /api/auth/register → 400 when password is too short", async () => {
  const r = await req("POST", "/api/auth/register", {
    body: { name: "Alice", email: "alice@example.com", password: "short" },
  });
  assert.equal(r.status, 400);
});

test("POST /api/auth/register → 201 creates user + returns token", async () => {
  const r = await req("POST", "/api/auth/register", {
    body: { name: "Alice", email: "alice@example.com", password: "password123" },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token, "token must be present");
  assert.equal(r.body.user.email, "alice@example.com");
  assert.equal(r.body.user.name, "Alice");
  assert.ok(!r.body.user.password_hash, "password_hash must NOT be exposed");
});

test("POST /api/auth/register → 409 on duplicate email", async () => {
  // alice was registered in previous test; email is case-normalised
  const r = await req("POST", "/api/auth/register", {
    body: { name: "Alice2", email: "ALICE@example.com", password: "password123" },
  });
  assert.equal(r.status, 409);
});

test("bcrypt hash is stored (not plaintext)", () => {
  const row = db
    .prepare("SELECT password_hash FROM users WHERE email = ?")
    .get("alice@example.com");
  assert.notEqual(row.password_hash, "password123");
  assert.ok(row.password_hash.startsWith("$2"), "must be a bcrypt hash");
});

// ── Auth — Login ──────────────────────────────────────────────────────────────

test("POST /api/auth/login → 400 on missing fields", async () => {
  const r = await req("POST", "/api/auth/login", { body: {} });
  assert.equal(r.status, 400);
});

test("POST /api/auth/login → 401 on wrong password", async () => {
  const r = await req("POST", "/api/auth/login", {
    body: { email: "alice@example.com", password: "wrongpassword" },
  });
  assert.equal(r.status, 401);
});

test("POST /api/auth/login → 401 on unknown email", async () => {
  const r = await req("POST", "/api/auth/login", {
    body: { email: "ghost@example.com", password: "password123" },
  });
  assert.equal(r.status, 401);
});

test("POST /api/auth/login → 200 returns token", async () => {
  const r = await req("POST", "/api/auth/login", {
    body: { email: "alice@example.com", password: "password123" },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
});

// ── Users — /me ───────────────────────────────────────────────────────────────

test("GET /api/users/me → 401 without token", async () => {
  const r = await req("GET", "/api/users/me");
  assert.equal(r.status, 401);
});

test("GET /api/users/me → 200 returns current user", async () => {
  const login = await req("POST", "/api/auth/login", {
    body: { email: "alice@example.com", password: "password123" },
  });
  const r = await req("GET", "/api/users/me", { token: login.body.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, "alice@example.com");
  assert.ok(!r.body.user.password_hash, "password_hash must NOT be in /me response");
});

// ── Tasks — auth guard ────────────────────────────────────────────────────────

test("GET /api/tasks → 401 without token", async () => {
  const r = await req("GET", "/api/tasks");
  assert.equal(r.status, 401);
});

test("GET /api/tasks → 401 with malformed token", async () => {
  const r = await req("GET", "/api/tasks", { token: "not.a.valid.jwt" });
  assert.equal(r.status, 401);
});

// ── Tasks — full CRUD lifecycle ───────────────────────────────────────────────

let token; // alice's token shared across the CRUD tests
let taskId;

test.before(async () => {
  const login = await req("POST", "/api/auth/login", {
    body: { email: "alice@example.com", password: "password123" },
  });
  token = login.body.token;
});

test("POST /api/tasks → 400 when title is missing", async () => {
  const r = await req("POST", "/api/tasks", {
    token,
    body: { description: "no title here" },
  });
  assert.equal(r.status, 400);
  const fields = r.body.details.map((d) => d.field);
  assert.ok(fields.includes("title"));
});

test("POST /api/tasks → 400 when title is empty string", async () => {
  const r = await req("POST", "/api/tasks", {
    token,
    body: { title: "   " },
  });
  assert.equal(r.status, 400);
});

test("POST /api/tasks → 400 on unknown field (strict schema)", async () => {
  const r = await req("POST", "/api/tasks", {
    token,
    body: { title: "My task", unknownField: true },
  });
  assert.equal(r.status, 400);
});

test("POST /api/tasks → 201 creates task", async () => {
  const r = await req("POST", "/api/tasks", {
    token,
    body: { title: "Build the API", description: "Write tests too", completed: false },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.task.title, "Build the API");
  assert.equal(r.body.task.completed, false);
  assert.ok(r.body.task.id);
  taskId = r.body.task.id;
});

test("GET /api/tasks → 200 lists user tasks with pagination", async () => {
  const r = await req("GET", "/api/tasks", { token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.tasks));
  assert.ok(r.body.pagination, "pagination metadata must be present");
  assert.ok(r.body.pagination.total >= 1);
});

test("GET /api/tasks?completed=false filters incomplete tasks", async () => {
  const r = await req("GET", "/api/tasks", {
    token,
    query: { completed: "false" },
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.tasks.every((t) => t.completed === false));
});

test("GET /api/tasks → 400 on invalid completed param", async () => {
  const r = await req("GET", "/api/tasks", {
    token,
    query: { completed: "maybe" },
  });
  assert.equal(r.status, 400);
});

test("GET /api/tasks/:id → 200 fetches task", async () => {
  const r = await req("GET", `/api/tasks/${taskId}`, { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.id, taskId);
});

test("GET /api/tasks/:id → 404 for non-existent task", async () => {
  const r = await req("GET", "/api/tasks/9999999", { token });
  assert.equal(r.status, 404);
});

test("PUT /api/tasks/:id → 400 when body is empty", async () => {
  const r = await req("PUT", `/api/tasks/${taskId}`, { token, body: {} });
  assert.equal(r.status, 400);
});

test("PUT /api/tasks/:id → 200 partial update (completed only)", async () => {
  const r = await req("PUT", `/api/tasks/${taskId}`, {
    token,
    body: { completed: true },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.completed, true);
  assert.equal(r.body.task.title, "Build the API"); // unchanged
});

test("PUT /api/tasks/:id → 200 updates title", async () => {
  const r = await req("PUT", `/api/tasks/${taskId}`, {
    token,
    body: { title: "Build the API v2", description: "Updated desc" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.title, "Build the API v2");
  assert.equal(r.body.task.description, "Updated desc");
});

test("PUT /api/tasks/:id → 404 for non-existent task", async () => {
  const r = await req("PUT", "/api/tasks/9999999", {
    token,
    body: { completed: true },
  });
  assert.equal(r.status, 404);
});

test("DELETE /api/tasks/:id → 404 for non-existent task", async () => {
  const r = await req("DELETE", "/api/tasks/9999999", { token });
  assert.equal(r.status, 404);
});

test("DELETE /api/tasks/:id → 204 deletes task", async () => {
  const r = await req("DELETE", `/api/tasks/${taskId}`, { token });
  assert.equal(r.status, 204);
  assert.equal(r.body, null);
});

test("GET /api/tasks/:id → 404 after deletion", async () => {
  const r = await req("GET", `/api/tasks/${taskId}`, { token });
  assert.equal(r.status, 404);
});

// ── Cross-user isolation ──────────────────────────────────────────────────────

test("User B cannot access User A's tasks", async () => {
  // Create a task for Alice
  const createAlice = await req("POST", "/api/tasks", {
    token,
    body: { title: "Alice private task" },
  });
  const aliceTaskId = createAlice.body.task.id;

  // Register Bob and get his token
  const bobReg = await req("POST", "/api/auth/register", {
    body: { name: "Bob", email: "bob@example.com", password: "password123" },
  });
  const bobToken = bobReg.body.token;

  // Bob tries to fetch Alice's task
  const r = await req("GET", `/api/tasks/${aliceTaskId}`, { token: bobToken });
  assert.equal(r.status, 404, "Bob must not see Alice's tasks");

  // Bob tries to delete Alice's task
  const del = await req("DELETE", `/api/tasks/${aliceTaskId}`, {
    token: bobToken,
  });
  assert.equal(del.status, 404);
});
