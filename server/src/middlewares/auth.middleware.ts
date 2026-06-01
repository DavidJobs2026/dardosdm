import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { unauthorized, forbidden } from "../utils/errors";
import { UserRole } from "@tournament/types";
import { prisma } from "../lib/prisma";

export interface AuthRequest extends Request {
  user?: { userId: string; role: string };
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
      select: { role: true },
    });
    if (!dbUser) return next(unauthorized("Usuario no encontrado"));

    req.user = { userId: payload.userId, role: dbUser.role };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
};

export const requireRole = (...roles: UserRole[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role as UserRole)) {
      return next(forbidden("Insufficient permissions"));
    }
    next();
  };
