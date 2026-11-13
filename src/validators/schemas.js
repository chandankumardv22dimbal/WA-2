const { z } = require("zod");

// ── Auth ─────────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email is required")
    .max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).optional().default(""),
    completed: z.boolean().optional().default(false),
  })
  .strict();

const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Title cannot be empty").max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// Query-string filters for GET /api/tasks
const taskQuerySchema = z.object({
  completed: z
    .enum(["true", "false"], { message: "completed must be 'true' or 'false'" })
    .optional(),
  page: z.coerce
    .number()
    .int()
    .min(1, "page must be >= 1")
    .optional()
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, "limit must be <= 100")
    .optional()
    .default(20),
});

module.exports = {
  registerSchema,
  loginSchema,
  taskCreateSchema,
  taskUpdateSchema,
  taskQuerySchema,
};
