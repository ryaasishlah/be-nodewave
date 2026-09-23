import { Context } from "hono";
import { ZodError } from "zod";

export const errorHandler = (err: Error, c: Context) => {
  console.error("Unhandled Error:", err);

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        message: "Validation Error",
        errors: err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  return c.json(
    {
      success: false,
      message: err.message || "Internal Server Error",
    },
    500
  );
};
