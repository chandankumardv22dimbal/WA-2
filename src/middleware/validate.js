/**
 * Middleware factory: validates req[source] against a Zod schema.
 * On failure returns 400 with structured field-level errors.
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || source,
        message: issue.message,
      }));
      return res.status(400).json({ error: "Validation failed", details });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
