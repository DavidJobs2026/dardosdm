import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import { ZodError } from "zod";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    err.errors.forEach((e) => {
      const key = e.path.join(".");
      errors[key] = errors[key] || [];
      errors[key].push(e.message);
    });
    return res.status(400).json({ message: "Validation error", errors, statusCode: 400 });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
      errors: err.errors,
      statusCode: err.statusCode,
    });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error", statusCode: 500 });
};
