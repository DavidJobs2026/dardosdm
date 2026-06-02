import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { badRequest, unauthorized, notFound } from "../utils/errors";
import { AuthRequest } from "../middlewares/auth.middleware";
import { sendWelcomeVerification, sendPasswordReset } from "../lib/email";

// ─── Request fingerprint helpers ─────────────────────────────────────────────
// We bind each refresh token to the User-Agent so a stolen cookie can't be
// replayed from a different browser/device.  IP is intentionally excluded
// because it changes legitimately (mobile networks, VPN, CGNAT).
function extractUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (!ua) return null;
  // Truncate to 512 chars — protects against absurdly long UA strings
  return ua.slice(0, 512);
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────
const COOKIE_NAME = "refreshToken";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in ms (matches REFRESH_EXPIRES)

const IS_PROD = process.env.NODE_ENV === "production";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,           // not accessible from JS
    secure:   IS_PROD,        // HTTPS only in prod
    // In production the frontend (dardosdm.com) and backend (railway.app) are on
    // different registrable domains, so "strict" silently blocks the cookie on
    // every cross-site fetch.  "none" + secure allows cross-origin credentials
    // while the CORS allowlist + httpOnly + path restriction maintain security.
    // In development (same-origin localhost) "lax" is enough.
    sameSite: IS_PROD ? "none" : "lax",
    maxAge:   COOKIE_MAX_AGE,
    path:     "/api/v1/auth", // only sent to auth routes
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/api/v1/auth", secure: IS_PROD, sameSite: IS_PROD ? "none" : "lax" });
}

const registerSchema = z.object({
  email:           z.string().email(),
  password:        z.string().min(8, "Password must be at least 8 characters"),
  name:            z.string().min(2, "Name must be at least 2 characters"),
  // "admin" is never allowed via the public registration endpoint.
  // Admins must be promoted by an existing admin via PATCH /users/:id/role.
  role:            z.enum(["organizer", "player"]).optional().default("player"),
  // Player-specific fields (optional for organizer/admin)
  dni:             z.string().optional(),
  phone:           z.string().optional(),
  province:        z.string().optional(),
  birthDate:       z.string().optional(),
  gdprConsent:     z.boolean().optional().default(false),
  whatsappConsent: z.boolean().optional().default(false),
  emailConsent:    z.boolean().optional().default(false),
  ligaCard:        z.string().max(16).optional(),
  clubCard:        z.string().max(16).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const checkDni = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dni = String(req.query.dni || "").trim().toUpperCase();
    if (!dni) return res.json({ data: { found: false } });

    const record = await prisma.playerRecord.findFirst({
      where: { dni: { equals: dni, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: { name: true, teamName: true, provincia: true, cardNumber: true, ppd: true, mpr: true, combined: true },
    });

    if (record) {
      return res.json({ data: { found: true, name: record.name, teamName: record.teamName, provincia: record.provincia, cardNumber: record.cardNumber } });
    }
    return res.json({ data: { found: false } });
  } catch (err) { next(err); }
};

export const checkPhone = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phone = String(req.query.phone || "").trim().replace(/\s/g, "");
    if (!phone) return res.json({ data: { inUse: false } });
    const existing = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
    return res.json({ data: { inUse: !!existing } });
  } catch (err) { next(err); }
};

export const checkEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.json({ data: { inUse: false } });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return res.json({ data: { inUse: !!existing } });
  } catch (err) { next(err); }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);
    const { password, role } = body;
    const email = body.email.toLowerCase().trim();
    const name  = body.name.trim().toUpperCase();
    const dni   = body.dni?.trim().toUpperCase() || null;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return next(badRequest("Email ya en uso"));

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate email-verification token (only for players)
    const isPlayer = role === "player";
    const emailVerifyToken   = isPlayer ? crypto.randomBytes(32).toString("hex") : null;
    const emailVerifyExpires = isPlayer ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

    const commonData = {
      email, name, passwordHash, role, dni,
      phone:           body.phone || null,
      province:        body.province || null,
      birthDate:       body.birthDate ? new Date(body.birthDate) : null,
      gdprConsent:     body.gdprConsent ?? false,
      whatsappConsent: body.whatsappConsent ?? false,
      emailConsent:    body.emailConsent ?? false,
      ligaCard:        body.ligaCard || null,
      clubCard:        body.clubCard || null,
      emailVerified:      !isPlayer,
      emailVerifyToken,
      emailVerifyExpires,
    };

    type UserRow = { id: string; email: string; name: string; role: string; elo: number; createdAt: Date; emailVerified: boolean };
    const userSelect = { id: true, email: true, name: true, role: true, elo: true, createdAt: true, emailVerified: true } as const;
    let user: UserRow;
    let isNewAccount = true;

    // If there's a ghost account with the same DNI (@torneo.local), absorb it.
    // All historical participant records stay linked because we keep the same id.
    if (dni) {
      const ghostEmail = `${dni.toLowerCase().replace(/[^a-z0-9]/g, "")}@torneo.local`;
      const ghost = await prisma.user.findUnique({ where: { email: ghostEmail } });
      if (ghost) {
        user = await prisma.user.update({ where: { id: ghost.id }, data: commonData, select: userSelect });
        isNewAccount = false;
        console.log(`[register] absorbed ghost ${ghost.id} (${ghostEmail}) → real account ${email}`);
      } else {
        // DNI used by a real (non-ghost) account → block
        const dniUsed = await prisma.user.findUnique({ where: { dni } });
        if (dniUsed) return next(badRequest("El DNI/NIE ya está registrado. Si no recibiste el email de verificación, usa el enlace de reenvío en la pantalla de login."));
        user = await prisma.user.create({ data: commonData, select: userSelect });
      }
    } else {
      user = await prisma.user.create({ data: commonData, select: userSelect });
    }

    // Create empty stats only for truly new accounts (ghost already has stats row)
    if (isNewAccount) {
      await prisma.playerStats.create({ data: { userId: user.id } }).catch(() => {});
    }

    // Send welcome + verification email (non-blocking)
    if (isPlayer && emailVerifyToken) {
      const clientUrl = process.env.CLIENT_URL ?? "https://torneos.dardosdm.com";
      const verifyUrl = `${clientUrl}/verificar-email?token=${emailVerifyToken}`;
      sendWelcomeVerification({ to: email, name, verifyUrl }).catch(err =>
        console.error("[email] Failed to send welcome email:", err)
      );
    }

    // Players must verify their email before getting tokens.
    // Organizers/admins are pre-verified so they get tokens immediately.
    if (isPlayer) {
      return res.status(201).json({
        data: {
          user: {
            id: user.id, email: user.email, name: user.name, role: user.role,
            elo: user.elo, createdAt: user.createdAt,
            emailVerified: false,
          },
          requiresEmailVerification: true,
          // No tokens — player must verify email and then log in
        },
      });
    }

    const payload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE);
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt, userAgent: extractUserAgent(req) },
    });

    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      data: {
        user: {
          id: user.id, email: user.email, name: user.name, role: user.role,
          elo: user.elo, createdAt: user.createdAt,
          emailVerified: user.emailVerified,
        },
        tokens: { accessToken },
        requiresEmailVerification: false,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Verify email ─────────────────────────────────────────────────────────────
export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return next(badRequest("Token requerido"));

    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
    if (!user) return next(badRequest("Enlace inválido o ya utilizado"));
    if (user.emailVerifyExpires && user.emailVerifyExpires < new Date()) {
      return next(badRequest("El enlace ha caducado. Solicita uno nuevo."));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified:      true,
        emailVerifyToken:   null,
        emailVerifyExpires: null,
      },
    });

    return res.json({ data: { verified: true, name: user.name } });
  } catch (err) { next(err); }
};

// ─── Request verification email (public — email in body, no token needed) ────
export const requestVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw   = z.object({ email: z.string().email() }).parse(req.body);
    const email = raw.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return 200 to avoid leaking whether the email exists
    if (!user || user.emailVerified) {
      return res.json({ data: { message: "Si la dirección es correcta recibirás el email en breve" } });
    }

    const emailVerifyToken   = crypto.randomBytes(32).toString("hex");
    const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken, emailVerifyExpires },
    });

    const clientUrl = process.env.CLIENT_URL ?? "https://torneos.dardosdm.com";
    const verifyUrl = `${clientUrl}/verificar-email?token=${emailVerifyToken}`;
    await sendWelcomeVerification({ to: user.email, name: user.name, verifyUrl });

    return res.json({ data: { message: "Si la dirección es correcta recibirás el email en breve" } });
  } catch (err) { next(err); }
};

// ─── Resend verification email ────────────────────────────────────────────────
export const resendVerification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    if (!userId) return next(unauthorized("No autenticado"));

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return next(notFound("Usuario"));
    if (user.emailVerified) return res.json({ data: { message: "Email ya verificado" } });

    const emailVerifyToken   = crypto.randomBytes(32).toString("hex");
    const emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifyToken, emailVerifyExpires },
    });

    const clientUrl = process.env.CLIENT_URL ?? "https://torneos.dardosdm.com";
    const verifyUrl = `${clientUrl}/verificar-email?token=${emailVerifyToken}`;
    await sendWelcomeVerification({ to: user.email, name: user.name, verifyUrl });

    return res.json({ data: { message: "Email de verificación reenviado" } });
  } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = loginSchema.parse(req.body);
    const email    = raw.email.toLowerCase().trim();
    const password = raw.password;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return next(unauthorized("Invalid credentials"));

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return next(unauthorized("Invalid credentials"));

    // Players must verify their email before logging in
    if (!user.emailVerified) {
      return res.status(403).json({
        error: "EMAIL_NOT_VERIFIED",
        message: "Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.",
      });
    }

    const payload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE);
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt, userAgent: extractUserAgent(req) },
    });

    setRefreshCookie(res, refreshToken);

    return res.json({
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, elo: user.elo, createdAt: user.createdAt },
        tokens: { accessToken }, // refreshToken is now in httpOnly cookie only
      },
    });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Refresh token is ONLY accepted from the httpOnly cookie — never from the request body
    const refreshToken = (req as any).cookies?.[COOKIE_NAME];
    if (!refreshToken) return next(unauthorized("Refresh token required"));

    // Delete-first pattern: attempt to delete the token atomically.
    // If two requests arrive simultaneously with the same token, only one
    // succeeds here — the other gets a Prisma P2025 (record not found) and
    // is rejected, preventing double-use without a read-then-delete race.
    let stored;
    try {
      stored = await prisma.refreshToken.delete({ where: { token: refreshToken } });
    } catch {
      // Token not found — already consumed or never existed
      clearRefreshCookie(res);
      return next(unauthorized("Invalid or expired refresh token"));
    }

    if (stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return next(unauthorized("Invalid or expired refresh token"));
    }

    // ── User-Agent binding check ──────────────────────────────────────────────
    // If the token was issued with a UA and the current request comes from a
    // different UA, treat it as a stolen token: reject + clear cookie.
    // Tokens issued before this feature (userAgent = null) are let through once
    // so existing sessions aren't broken on deploy; the replacement token will
    // carry the UA going forward.
    const currentUA = extractUserAgent(req);
    if (stored.userAgent !== null && stored.userAgent !== currentUA) {
      clearRefreshCookie(res);
      console.warn(`[auth] refresh token UA mismatch — possible token theft. userId=${stored.userId} stored="${stored.userAgent?.slice(0, 80)}" current="${currentUA?.slice(0, 80)}"`);
      return next(unauthorized("Session invalid — please log in again"));
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return next(notFound("User"));

    // Block unverified players — clears the cookie so they must re-login after verifying
    if (!user.emailVerified && user.role === "player") {
      clearRefreshCookie(res);
      return next(unauthorized("Email not verified"));
    }

    const newPayload = { userId: user.id, role: user.role };
    const accessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE);
    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: user.id, expiresAt, userAgent: currentUA },
    });

    setRefreshCookie(res, newRefreshToken);

    // Only return accessToken — refreshToken lives in the cookie
    return res.json({ data: { tokens: { accessToken } } });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Refresh token is ONLY accepted from the httpOnly cookie — never from the request body
    const refreshToken = (req as any).cookies?.[COOKIE_NAME];
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    clearRefreshCookie(res);
    return res.json({ data: null, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

// ─── Logout all sessions ──────────────────────────────────────────────────────
export const logoutAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user?.userId;
    if (!userId) return next(unauthorized("No autenticado"));

    // Revoke every refresh token for this user — kills all active sessions
    await prisma.refreshToken.deleteMany({ where: { userId } });
    clearRefreshCookie(res);
    return res.json({ data: null, message: "Todas las sesiones cerradas" });
  } catch (err) {
    next(err);
  }
};

export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, avatarUrl: true, role: true, elo: true, createdAt: true, emailVerified: true },
    });
    if (!user) return next(notFound("User"));
    return res.json({ data: user });
  } catch (err) {
    next(err);
  }
};

// ─── Forgot password — send reset email ──────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw   = z.object({ email: z.string().email() }).parse(req.body);
    const email = raw.email.toLowerCase().trim();

    // Always return 200 — never reveal whether the email exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token   = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data:  { pwResetToken: token, pwResetExpires: expires },
      });

      const clientUrl = process.env.CLIENT_URL ?? "https://torneos.dardosdm.com";
      const resetUrl  = `${clientUrl}/auth/reset-password?token=${token}`;

      sendPasswordReset({ to: user.email, name: user.name, resetUrl }).catch((e) =>
        console.error("[auth] forgot-password email failed:", e)
      );
    }

    return res.json({ message: "Si el email existe, recibirás un enlace en breve" });
  } catch (err) {
    next(err);
  }
};

// ─── Reset password — validate token and set new password ────────────────────
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = z.object({
      token:    z.string().min(1),
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { pwResetToken: token } });

    if (!user || !user.pwResetExpires || user.pwResetExpires < new Date()) {
      return next(badRequest("El enlace de restablecimiento no es válido o ha expirado"));
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token; also invalidate all refresh tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data:  { passwordHash, pwResetToken: null, pwResetExpires: null },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    next(err);
  }
};
