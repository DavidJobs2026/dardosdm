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

  // VULN-028: Prisma errors must never reach the client with internal details
  // (table names, column names, constraint names, query fragments).
  // Map known Prisma error codes to safe generic messages.
  const prismaErr = err as any;
  if (prismaErr?.code?.startsWith("P")) {
    const safeMessages: Record<string, string> = {
      P2002: "Ya existe un registro con esos datos",           // unique constraint
      P2003: "Referencia inválida",                            // FK constraint
      P2025: "Registro no encontrado",                         // record not found on update/delete
      P2016: "Error en la consulta",                           // query interpretation
      P2021: "Tabla no encontrada en la base de datos (migración pendiente)",  // table missing
      P2022: "Campo no encontrado en la base de datos",        // column missing (migration pending)
    };
    const message = safeMessages[prismaErr.code] ?? "Error de base de datos";
    console.error(`[prisma] ${prismaErr.code}:`, prismaErr.message);
    return res.status(400).json({ message, statusCode: 400 });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ message: "Internal server error", statusCode: 500 });
};
