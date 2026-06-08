import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { unauthorized, forbidden } from "../utils/errors";
import { UserRole } from "@tournament/types";
import { prisma } from "../lib/prisma";

export interface AuthRequest extends Request {
  user?: { userId: string; role: string; name?: string };
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next(unauthorized());

  try {
    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    // Always fetch the current role from the DB so role changes take effect immediately
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, name: true },
    });
    if (!dbUser) return next(unauthorized("Usuario no encontrado"));

    req.user = { userId: payload.userId, role: dbUser.role, name: dbUser.name ?? undefined };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
};

/**
 * Like authenticate but non-blocking: sets req.user if a valid Bearer token
 * is present, silently skips if there is none. Used on public endpoints that
 * need to behave differently for logged-in vs anonymous callers.
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next(); // no token — continue as anonymous

  try {
    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, name: true },
    });
    if (dbUser) req.user = { userId: payload.userId, role: dbUser.role, name: dbUser.name ?? undefined };
  } catch { /* invalid/expired token — treat as anonymous */ }
  next();
};

export const requireRole = (...roles: UserRole[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role as UserRole)) {
      return next(forbidden("Insufficient permissions"));
    }
    next();
  };
