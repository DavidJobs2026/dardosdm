import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { unauthorized, forbidden } from "../utils/errors";
import { UserRole } from "@tournament/types";
import { prisma } from "../lib/prisma";

// ─── User cache ───────────────────────────────────────────────────────────────
// Avoids a DB round-trip on every authenticated request.
// A role change is visible to the system within USER_CACHE_TTL_MS at most,
// unless invalidateUserCache() is called explicitly (e.g. after updateUserRole).
const USER_CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  role: string;
  name: string | null;
  expiresAt: number;
}

const userCache = new Map<string, CacheEntry>();

function getCached(userId: string): CacheEntry | null {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(userId);
    return null;
  }
  return entry;
}

function setCache(userId: string, role: string, name: string | null): void {
  userCache.set(userId, { role, name, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/** Call this after any operation that changes a user's role or name. */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

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

    const cached = getCached(payload.userId);
    if (cached) {
      req.user = { userId: payload.userId, role: cached.role, name: cached.name ?? undefined };
      return next();
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true, name: true },
    });
    if (!dbUser) {
      invalidateUserCache(payload.userId);
      return next(unauthorized("Usuario no encontrado"));
    }

    setCache(payload.userId, dbUser.role, dbUser.name ?? null);
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

    const cached = getCached(payload.userId);
    if (cached) {
      req.user = { userId: payload.userId, role: cached.role, name: cached.name ?? undefined };
    } else {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { role: true, name: true },
      });
      if (dbUser) {
        setCache(payload.userId, dbUser.role, dbUser.name ?? null);
        req.user = { userId: payload.userId, role: dbUser.role, name: dbUser.name ?? undefined };
      }
    }
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
