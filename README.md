# Task CRUD API

A production-quality REST API built with **Node.js**, **Express 5**, **SQLite** (via `better-sqlite3`), **bcrypt** password hashing, and **JWT** authentication.

Each task is scoped to the authenticated user — users can only see and modify their own data.

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Authentication flow](#authentication-flow)
- [Error responses](#error-responses)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Auth — Register](#post-apiauthregister)
  - [Auth — Login](#post-apiauthlogin)
  - [Users — Me](#get-apiusersme)
  - [Tasks — List](#get-apitasks)
  - [Tasks — Create](#post-apitasks)
  - [Tasks — Get one](#get-apitasksid)
  - [Tasks — Update](#put-apitasksid)
  - [Tasks — Delete](#delete-apitasksid)
- [Running tests](#running-tests)
- [Design decisions](#design-decisions)

---

## Quick start

> **Requires Node.js ≥ 20**

```bash
# 1. Install dependencies
npm install

# 2. (Optional) set environment variables — see below
# 3. Start the server
npm start
# → Task API listening on http://localhost:3000

# Development mode (auto-restart on file change)
npm run dev
```

SQLite data is persisted in `data.sqlite` (created automatically on first run).

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the server listens on |
| `JWT_SECRET` | `development-only-change-me` | **Change this in production!** |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime (e.g. `24h`, `7d`) |
| `DB_PATH` | `./data.sqlite` | Path to the SQLite database file |

> ⚠️ **Never** run in production with the default `JWT_SECRET`.

---

## Project structure

```
src/
├── app.js                  # Express app factory (routes wired here)
├── server.js               # Starts the HTTP server
├── db.js                   # SQLite connection + schema migrations
├── middleware/
│   ├── authenticate.js     # JWT auth middleware
│   └── validate.js         # Zod validation middleware factory
├── routes/
│   ├── auth.js             # POST /api/auth/register, /login
│   ├── tasks.js            # CRUD /api/tasks
│   └── users.js            # GET /api/users/me
└── validators/
    └── schemas.js          # All Zod schemas in one place
test/
└── api.test.js             # Integration tests (Node built-in runner)
```

---

## Authentication flow

1. **Register** → receive a JWT
2. **Login** → receive a fresh JWT
3. Include the token in every protected request:

```http
Authorization: Bearer <token>
```

Tokens expire after **1 hour** by default (configurable via `JWT_EXPIRES_IN`).

---

## Error responses

All errors follow a consistent shape:

```json
{ "error": "Human-readable message" }
```

Validation errors include per-field detail:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "A valid email is required" },
    { "field": "password", "message": "Password must be at least 8 characters" }
  ]
}
```

| Status | Meaning |
|--------|---------|
| `200` | OK |
| `201` | Created |
| `204` | No Content (successful DELETE) |
| `400` | Bad request / validation error |
| `401` | Missing or invalid token / wrong credentials |
| `404` | Resource not found |
| `409` | Conflict (e.g. duplicate email) |
| `500` | Unexpected server error |

---

## Endpoints

### Health

#### `GET /health`

No authentication required.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### `POST /api/auth/register`

Register a new user. Passwords are hashed with **bcrypt** (cost factor 12) before storage — plain-text passwords are never persisted.

**Request body:**
```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "correct-horse-battery"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | Required, 1–100 chars |
| `email` | string | Required, valid email, max 255 chars |
| `password` | string | Required, 8–72 chars |

**Response `201`:**
```json
{
  "user": { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com" },
  "token": "<jwt>"
}
```

**Errors:** `400` validation, `409` email already registered.

---

### `POST /api/auth/login`

Authenticate with email and password.

**Request body:**
```json
{ "email": "ada@example.com", "password": "correct-horse-battery" }
```

**Response `200`:**
```json
{
  "user": { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com" },
  "token": "<jwt>"
}
```

**Errors:** `400` validation, `401` invalid credentials.

---

### `GET /api/users/me`

🔒 **Protected**

Returns the authenticated user's profile.

**Response `200`:**
```json
{ "user": { "id": 1, "name": "Ada Lovelace", "email": "ada@example.com" } }
```

---

### `GET /api/tasks`

🔒 **Protected**

List all tasks belonging to the authenticated user. Supports filtering and pagination.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `completed` | `true` \| `false` | — | Filter by completion status |
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | integer 1–100 | `20` | Items per page |

**Response `200`:**
```json
{
  "tasks": [
    {
      "id": 3,
      "title": "Ship the API",
      "description": "Run end-to-end tests",
      "completed": false,
      "created_at": "2026-11-13 10:00:00",
      "updated_at": "2026-11-13 10:00:00"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

**Errors:** `400` invalid query params, `401` unauthenticated.

---

### `POST /api/tasks`

🔒 **Protected**

Create a new task.

**Request body:**
```json
{
  "title": "Ship the API",
  "description": "Run end-to-end tests",
  "completed": false
}
```

| Field | Type | Rules |
|-------|------|-------|
| `title` | string | **Required**, 1–200 chars |
| `description` | string | Optional, max 2000 chars; defaults to `""` |
| `completed` | boolean | Optional; defaults to `false` |

**Response `201`:**
```json
{
  "task": {
    "id": 3,
    "title": "Ship the API",
    "description": "Run end-to-end tests",
    "completed": false,
    "created_at": "2026-11-13 10:00:00",
    "updated_at": "2026-11-13 10:00:00"
  }
}
```

**Errors:** `400` validation (unknown fields are also rejected), `401` unauthenticated.

---

### `GET /api/tasks/:id`

🔒 **Protected**

Fetch a single task by ID. Returns `404` if the task doesn't exist **or** belongs to a different user (no information leakage).

**Response `200`:**
```json
{ "task": { "id": 3, "title": "...", "description": "...", "completed": false, "created_at": "...", "updated_at": "..." } }
```

**Errors:** `401` unauthenticated, `404` not found.

---

### `PUT /api/tasks/:id`

🔒 **Protected**

Partially update a task. All fields are optional, but **at least one** must be provided.

**Request body** (all fields optional, min 1):
```json
{ "title": "Updated title", "completed": true }
```

**Response `200`:**
```json
{ "task": { ...updated task object... } }
```

**Errors:** `400` validation (empty body or unknown fields), `401` unauthenticated, `404` not found.

---

### `DELETE /api/tasks/:id`

🔒 **Protected**

Permanently delete a task.

**Response `204 No Content`** — empty body on success.

**Errors:** `401` unauthenticated, `404` not found.

---

## Running tests

```bash
npm test
```

The suite uses **Node.js's built-in test runner** (no extra dependencies). It spins up the server on a random port using an isolated in-memory SQLite database, runs all assertions, then tears down.

Coverage includes:
- Health endpoint
- Registration validation (empty body, bad email, short password, duplicate)
- Password hashing verification
- Login validation and wrong credentials
- JWT auth guard on every protected route
- Full task CRUD lifecycle
- Filtering and pagination query validation
- Cross-user isolation (User B cannot read/delete User A's tasks)

---

## Design decisions

| Decision | Rationale |
|----------|-----------|
| **SQLite + better-sqlite3** | Zero-config, synchronous API fits Express's sync route handlers cleanly; trivial to swap for PostgreSQL/MySQL in production |
| **Zod** for validation | Type-safe schemas with detailed error paths; strict mode on task schemas rejects unknown fields |
| **bcryptjs** (cost 12) | Pure-JS implementation, no native build step; cost 12 is OWASP-recommended for 2024+ hardware |
| **JWT** (1 h default) | Stateless tokens; set `JWT_EXPIRES_IN=7d` for a smoother dev experience |
| **404 on foreign tasks** | Avoids leaking the existence of another user's resources |
| **Pagination on list** | Prevents unbounded result sets from becoming a DoS vector |
# WA-2
