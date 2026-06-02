import { Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import bcrypt from "bcryptjs";
import { badRequest, forbidden, notFound } from "../utils/errors";
import { Prisma } from "@prisma/client";
import { audit } from "../lib/audit";

/** GET /users/search?q=...&tournamentId=... */
export const searchUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Players must not search for other users — prevents PII enumeration
    if (req.user!.role === "player") return next(forbidden());

    const q = String(req.query.q || "").trim();
    const tournamentId = req.query.tournamentId ? String(req.query.tournamentId) : null;

    if (!q || q.length < 1) return res.json({ data: [] });

    // Find users matching the search (by name OR DNI)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { dni:  { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, elo: true, avatarUrl: true, role: true, dni: true },
      take: 20,
      orderBy: { elo: "desc" },
    });

    // Enrich all users with their most recent metricValue + gamesPlayed from participant history
    const userIds = users.map((u: typeof users[number]) => u.id);
    const latestParts = await prisma.participant.findMany({
      where:   { userId: { in: userIds }, metricValue: { not: null } },
      orderBy: { registeredAt: "desc" },
      select:  { userId: true, metricValue: true, gamesPlayed: true, teamName: true },
      distinct: ["userId"],
    });
    const metricMap = new Map(latestParts.map((p: { userId: string | null; metricValue: number | null; gamesPlayed: number | null; teamName: string | null }) => [p.userId, { metricValue: p.metricValue, gamesPlayed: p.gamesPlayed, teamName: p.teamName }]));
    const enriched = users.map((u: typeof users[number]) => ({
      ...u,
      metricValue:  metricMap.get(u.id)?.metricValue  ?? null,
      gamesPlayed:  metricMap.get(u.id)?.gamesPlayed  ?? null,
      teamName:     metricMap.get(u.id)?.teamName     ?? null,
    }));

    // If tournamentId given, mark which ones are already registered
    if (tournamentId) {
      const participants = await prisma.participant.findMany({
        where: { tournamentId },
        select: { userId: true },
      });
      const registeredIds = new Set(participants.map((p: { userId: string | null }) => p.userId).filter(Boolean));

      const result = enriched.map((u: typeof enriched[number]) => ({
        ...u,
        alreadyRegistered: registeredIds.has(u.id),
      }));
      return res.json({ data: result });
    }

    return res.json({ data: enriched });
  } catch (err) {
    next(err);
  }
};

// ─── Batch create players ─────────────────────────────────────────────────────

const batchSchema = z.object({
  players: z.array(z.object({
    name:          z.string().min(1).max(100),
    email:         z.string().email(),
    elo:           z.number().int().optional(),
    teamName:      z.string().max(100).optional(),
    provincia:     z.string().max(100).optional(),
    password:      z.string().max(128).optional(),
    level:         z.string().max(50).optional(),
    metricValue:   z.number().optional(),
    gamesPlayed:   z.number().int().optional(),
    dni:           z.string().max(20).optional(),
    paymentStatus: z.enum(["pending", "paid"]).optional(),
    paymentMethod: z.enum(["cash", "card"]).optional(),
    ppd:           z.number().optional(),
    mpr:           z.number().optional(),
  })).min(1).max(1000),
  tournamentId: z.string().optional(),
});

const SPECIAL_SEASON = "JUGADORES PROPIOS";

function randomPassword(len = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** POST /users/batch-create — create platform accounts from Excel/manual list & optionally inscribe */
export const batchCreateUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));

    const { players, tournamentId } = batchSchema.parse(req.body);

    // Check tournament exists + not full
    const tournament = tournamentId
      ? await prisma.tournament.findUnique({
          where: { id: tournamentId },
          include: { _count: { select: { participants: true } } },
        })
      : null;

    if (tournamentId) {
      if (!tournament) return next(badRequest("Torneo no encontrado"));
      if (tournament.participantType !== "individual" && tournament.participantType !== "parejas_ciegas") return next(badRequest("Este torneo no acepta inscripciones individuales"));
    }

    const results: { name: string; email: string; status: "created" | "existing" | "error"; userId?: string; password?: string; error?: string }[] = [];

    // Track participant count locally so we don't mutate the Prisma object
    let currentParticipantCount = tournament?._count.participants ?? 0;

    for (const p of players) {
      try {
        let existing = await prisma.user.findUnique({ where: { email: p.email } });
        const pw = p.password || randomPassword();

        if (!existing) {
          const hash = await bcrypt.hash(pw, 12);
          existing = await prisma.user.create({
            data: {
              name: p.name.trim().toUpperCase(),
              email: p.email,
              passwordHash: hash,
              role: "player",
              elo: p.elo ?? 1000,
            },
          });
          // Never return the plaintext password in API responses.
          // Credentials should be distributed out-of-band (email, welcome message, etc.)
          results.push({ name: p.name, email: p.email, status: "created", userId: existing.id });
        } else {
          results.push({ name: existing.name, email: existing.email, status: "existing", userId: existing.id });
        }

        // Upsert PlayerRecord for manually-added players (when PPD/MPR is provided)
        if (p.ppd != null || p.mpr != null) {
          const computed = ((p.mpr ?? 0) * 10) + (p.ppd ?? 0);
          const dniKey = p.dni?.trim() || null;
          const recordData = {
            name:        p.name,
            ppd:         p.ppd         ?? null,
            mpr:         p.mpr         ?? null,
            combined:    computed,
            teamName:    p.teamName    ?? null,
            provincia:   p.provincia   ?? null,
            season:      SPECIAL_SEASON,
            gameType:    null as string | null,
          };

          if (dniKey) {
            const existingRec = await prisma.playerRecord.findFirst({
              where: { dni: dniKey, season: SPECIAL_SEASON },
              select: { id: true },
            });
            if (existingRec) {
              await prisma.playerRecord.update({ where: { id: existingRec.id }, data: { ...recordData, dni: dniKey } });
            } else {
              await prisma.playerRecord.create({ data: { ...recordData, dni: dniKey } });
            }
          } else {
            const existingRec = await prisma.playerRecord.findFirst({
              where: { name: { equals: p.name, mode: "insensitive" }, season: SPECIAL_SEASON },
              select: { id: true },
            });
            if (existingRec) {
              await prisma.playerRecord.update({ where: { id: existingRec.id }, data: recordData });
            } else {
              await prisma.playerRecord.create({ data: { ...recordData, dni: null } });
            }
          }
        }

        // Inscribe in tournament if requested
        if (tournament && existing) {
          const already = await prisma.participant.findUnique({
            where: { tournamentId_userId: { tournamentId: tournament.id, userId: existing.id } },
          });
          // maxParticipants = 0 means unlimited — never full
          const notFull = tournament.maxParticipants === 0 || currentParticipantCount < tournament.maxParticipants;
          if (!already && notFull) {
            await prisma.participant.create({
              data: {
                tournamentId:  tournament.id,
                entityType:    tournament.participantType as any,
                userId:        existing.id,
                level:         p.level         ?? null,
                metricValue:   p.metricValue   ?? null,
                gamesPlayed:   p.gamesPlayed   ?? null,
                dni:           p.dni           ?? null,
                teamName:      p.teamName      ?? null,
                provincia:     p.provincia     ?? null,
                paymentStatus: p.paymentStatus ?? "pending",
                paymentMethod: p.paymentMethod ?? null,
              },
            });
            currentParticipantCount++;
          }
        }
      } catch (err: any) {
        results.push({ name: p.name, email: p.email, status: "error", error: err.message });
      }
    }

    return res.json({ data: results });
  } catch (err) {
    next(err);
  }
};

// ─── findOrCreatePlayer ───────────────────────────────────────────────────────
// Finds an existing user by DNI or exact name, or creates one.
// Does NOT inscribe the player in any tournament.

export const findOrCreatePlayer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden("Solo organizadores o admins"));
    const { name, dni, metricValue } = z.object({
      name:        z.string().min(1),
      dni:         z.string().optional(),
      metricValue: z.number().optional(),
    }).parse(req.body);

    let user: { id: string; name: string } | null = null;

    if (dni) {
      const dniNorm = dni.trim().toUpperCase();
      // 1. Prefer real account (has actual email, not @torneo.local)
      user = await prisma.user.findFirst({
        where: { dni: dniNorm, NOT: { email: { endsWith: "@torneo.local" } } },
        select: { id: true, name: true },
      });
      // 2. Fall back to ghost account
      if (!user) {
        const slug = dniNorm.toLowerCase().replace(/[^a-z0-9]/g, "");
        user = await prisma.user.findFirst({
          where: { email: `${slug}@torneo.local` },
          select: { id: true, name: true },
        });
      }
    }
    if (!user) {
      // Try real account by exact name first
      user = await prisma.user.findFirst({
        where: {
          name: { equals: name.trim(), mode: "insensitive" },
          NOT: { email: { endsWith: "@torneo.local" } },
        },
        select: { id: true, name: true },
      }) ?? await prisma.user.findFirst({
        where: { name: { equals: name.trim(), mode: "insensitive" } },
        select: { id: true, name: true },
      });
    }

    const created = !user;
    if (!user) {
      const emailSlug = dni
        ? dni.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
        : name.trim().toLowerCase()
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9\s]/g, "").trim()
            .split(/\s+/).slice(0, 3).join(".");
      const email    = `${emailSlug || "jugador"}@torneo.local`;
      // Use a cryptographically-secure random password — these @torneo.local accounts
      // are internal-only and should not be loginable via the public auth endpoint.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
      user = await prisma.user.create({
        data:   { name: name.trim().toUpperCase(), email, passwordHash },
        select: { id: true, name: true },
      });
    }

    return res.json({ data: { id: user.id, name: user.name, metricValue: metricValue ?? null, created } });
  } catch (err) {
    next(err);
  }
};

/** GET /users/me/stats — own profile */
export const getMyProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true, elo: true, avatarUrl: true, createdAt: true },
    });

    const stats = await prisma.playerStats.findUnique({
      where: { userId: req.user!.userId },
    });

    return res.json({ data: { ...user, stats } });
  } catch (err) {
    next(err);
  }
};

/** GET /users/players — list all non-admin real users with full profile (admin + organizer) */
export const listPlayers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    const players = await prisma.user.findMany({
      where: {
        // Include players AND organizers — an organizer may still compete as a player
        role: { in: ["player", "organizer"] },
        NOT: { email: { endsWith: "@torneo.local" } },
      },
      select: {
        id: true, name: true, email: true, role: true,
        dni: true, phone: true, province: true, birthDate: true,
        gdprConsent: true, whatsappConsent: true, emailConsent: true,
        ligaCard: true, clubCard: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return res.json({ data: players });
  } catch (err) { next(err); }
};

/** PATCH /users/:id/profile — update player profile (admin + organizer) */
export const updateUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    const body = z.object({
      name:          z.string().min(2).optional(),
      email:         z.string().email().optional(),
      phone:         z.string().optional().nullable(),
      province:      z.string().optional().nullable(),
      dni:           z.string().optional().nullable(),
      birthDate:     z.string().optional().nullable(),
      ligaCard:      z.string().max(16).optional().nullable(),
      clubCard:      z.string().max(16).optional().nullable(),
      emailVerified: z.boolean().optional(),
    }).parse(req.body);

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(body.name          !== undefined && { name: body.name }),
        ...(body.email         !== undefined && { email: body.email }),
        ...(body.phone         !== undefined && { phone: body.phone }),
        ...(body.province      !== undefined && { province: body.province }),
        ...(body.dni           !== undefined && { dni: body.dni }),
        ...(body.ligaCard      !== undefined && { ligaCard: body.ligaCard }),
        ...(body.clubCard      !== undefined && { clubCard: body.clubCard }),
        ...(body.emailVerified !== undefined && { emailVerified: body.emailVerified }),
        ...(body.birthDate !== undefined && {
          birthDate: body.birthDate ? new Date(body.birthDate) : null,
        }),
      },
      select: {
        id: true, name: true, email: true, role: true,
        dni: true, phone: true, province: true, birthDate: true,
        ligaCard: true, clubCard: true, emailVerified: true, createdAt: true,
      },
    });
    return res.json({ data: updated, message: "Perfil actualizado" });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return next(badRequest("Este email ya está en uso por otra cuenta"));
    }
    next(err);
  }
};

/** POST /users/:id/reset-password — reset password to DNI (admin + organizer) */
export const resetPasswordToDni = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, dni: true, name: true, role: true },
    });
    if (!user) return next(badRequest("Usuario no encontrado"));
    // Organizers can only reset passwords of players, not other organizers or admins
    if (req.user!.role === "organizer" && user.role !== "player") {
      return next(forbidden("Los organizadores solo pueden modificar jugadores"));
    }
    if (!user.dni) return next(badRequest("El jugador no tiene DNI/NIE registrado. Añade el DNI primero."));

    const hash = await bcrypt.hash(user.dni.toUpperCase(), 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    audit({ req, action: "user.reset_password", entityType: "user", entityId: user.id, entityName: user.name });
    return res.json({ message: `Contraseña de ${user.name} restablecida al DNI/NIE` });
  } catch (err) { next(err); }
};

/** GET /users — list all users (admin only) */
export const listUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "admin") return next(forbidden());
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, elo: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ data: users });
  } catch (err) { next(err); }
};

/** PATCH /users/:id/role — change user role (admin only) */
export const updateUserRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "admin") return next(forbidden());
    const { role } = z.object({
      role: z.enum(["admin", "organizer", "player"]),
    }).parse(req.body);

    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, name: true } });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });
    audit({ req, action: "user.role_change", entityType: "user", entityId: updated.id, entityName: updated.name, details: { from: target?.role, to: role } });
    return res.json({ data: updated, message: "Rol actualizado" });
  } catch (err) { next(err); }
};

/** PATCH /users/:id/name — change user name (admin + organizer, but organizer → players only) */
export const updateUserName = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    const { name } = z.object({
      name: z.string().min(2, "Mínimo 2 caracteres"),
    }).parse(req.body);

    if (req.user!.role === "organizer") {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      if (!target) return next(badRequest("Usuario no encontrado"));
      if (target.role !== "player") return next(forbidden("Los organizadores solo pueden modificar jugadores"));
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { name },
      select: { id: true, name: true, email: true, role: true },
    });
    return res.json({ data: updated, message: "Nombre actualizado" });
  } catch (err) { next(err); }
};

/** PATCH /users/:id/password — reset user password (admin + organizer, but organizer → players only) */
export const updateUserPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    const { password } = z.object({
      password: z.string().min(8, "Mínimo 8 caracteres"),
    }).parse(req.body);

    if (req.user!.role === "organizer") {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      if (!target) return next(badRequest("Usuario no encontrado"));
      if (target.role !== "player") return next(forbidden("Los organizadores solo pueden modificar jugadores"));
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id }, select: { name: true } });
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: hash },
    });
    audit({ req, action: "user.reset_password", entityType: "user", entityId: req.params.id, entityName: targetUser?.name });
    return res.json({ message: "Contraseña actualizada" });
  } catch (err) { next(err); }
};

/** GET /admin/audit-logs — paginated audit log (admin only) */
export const getAuditLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "admin") return next(forbidden());

    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip   = (page - 1) * limit;
    const action = req.query.action ? String(req.query.action) : undefined;
    const userId = req.query.userId ? String(req.query.userId) : undefined;

    const where = {
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({ data: logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

/** DELETE /users/:id — delete user (admin + organizer, but organizer → players only) */
export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());
    if (req.params.id === req.user!.userId) return next(badRequest("No puedes eliminarte a ti mismo"));

    if (req.user!.role === "organizer") {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      if (!target) return next(badRequest("Usuario no encontrado"));
      if (target.role !== "player") return next(forbidden("Los organizadores solo pueden eliminar jugadores"));
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    return res.json({ message: "Usuario eliminado" });
  } catch (err) { next(err); }
};

/** GET /users/:id/ghost-preview — returns the ghost account data before merging */
export const ghostPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());

    const realUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, dni: true, elo: true, createdAt: true },
    });
    if (!realUser) return next(notFound("Usuario"));
    if (!realUser.dni) return next(badRequest("El jugador no tiene DNI. Añádelo primero."));

    const slug  = realUser.dni.toLowerCase().replace(/[^a-z0-9]/g, "");
    const ghost = await prisma.user.findUnique({
      where: { email: `${slug}@torneo.local` },
      select: {
        id:        true,
        name:      true,
        email:     true,
        elo:       true,
        createdAt: true,
        participants: {
          select: {
            id:            true,
            finalPosition: true,
            registeredAt:  true,
            tournament: { select: { id: true, name: true, status: true, startDate: true } },
          },
          orderBy: { registeredAt: "desc" },
        },
      },
    });

    if (!ghost) {
      return res.json({ data: { ghost: null } });
    }

    // Detect conflicts: tournaments where the real user is already registered
    const realPartTournIds = new Set(
      (await prisma.participant.findMany({
        where:  { userId: realUser.id },
        select: { tournamentId: true },
      })).map((p: { tournamentId: string }) => p.tournamentId)
    );

    const ghostParticipants = ghost.participants.map((gp: typeof ghost.participants[number]) => ({
      ...gp,
      conflict: realPartTournIds.has(gp.tournament.id),
    }));

    return res.json({
      data: {
        ghost: { ...ghost, participants: ghostParticipants },
        transferCount:  ghostParticipants.filter(gp => !gp.conflict).length,
        conflictCount:  ghostParticipants.filter(gp =>  gp.conflict).length,
      },
    });
  } catch (err) { next(err); }
};

/** POST /users/:id/absorb-ghost — merge a @torneo.local ghost into a real user account */
// Finds the ghost account with the same DNI as the real user and reassigns all
// participant records from ghost → real. Then deletes the ghost.
export const absorbGhost = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());

    const realUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, dni: true, email: true },
    });
    if (!realUser) return next(notFound("Usuario"));
    if (realUser.email.endsWith("@torneo.local")) return next(badRequest("El usuario destino no puede ser un jugador fantasma"));

    // Find ghost: either by explicit ghostId param or by DNI
    const ghostId = req.body?.ghostId as string | undefined;
    let ghost: { id: string; email: string } | null = null;

    if (ghostId) {
      ghost = await prisma.user.findUnique({ where: { id: ghostId }, select: { id: true, email: true } });
      if (!ghost?.email.endsWith("@torneo.local")) return next(badRequest("El usuario a fusionar no es un jugador fantasma"));
    } else if (realUser.dni) {
      const slug = realUser.dni.toLowerCase().replace(/[^a-z0-9]/g, "");
      ghost = await prisma.user.findUnique({ where: { email: `${slug}@torneo.local` }, select: { id: true, email: true } });
    }

    if (!ghost) return next(badRequest("No se encontró un jugador fantasma con ese DNI para fusionar"));

    // Reassign participant records from ghost → real user (skip duplicates per tournament)
    const ghostParticipants = await prisma.participant.findMany({
      where: { userId: ghost.id },
      select: { id: true, tournamentId: true },
    });

    for (const gp of ghostParticipants) {
      const conflict = await prisma.participant.findFirst({
        where: { userId: realUser.id, tournamentId: gp.tournamentId },
      });
      if (!conflict) {
        await prisma.participant.update({ where: { id: gp.id }, data: { userId: realUser.id } });
      }
      // If conflict exists, leave the ghost participant (real user already inscribed in that tournament)
    }

    // Delete ghost account (cascade deletes remaining participants tied to ghost)
    await prisma.user.delete({ where: { id: ghost.id } });

    return res.json({ message: `Jugador fantasma fusionado con ${realUser.name}. El historial de partidas ha sido transferido.` });
  } catch (err) { next(err); }
};
