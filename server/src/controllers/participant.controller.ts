import { Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { audit } from "../lib/audit";
import { canManageTournament, selectCoOrg } from "../utils/tournament-access";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the tournament accepts individual-level registrations */
const isIndividualType = (t: string) =>
  t === "individual" || t === "parejas_ciegas";

/** Returns true if the tournament requires group (multi-player) registrations */
const isGroupType = (t: string) =>
  t === "parejas" || t === "trios" || t === "equipos";

const INCLUDE_PARTICIPANT = {
  user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
  team: {
    select: {
      id: true, name: true, logoUrl: true,
      members: {
        select: {
          role:        true,
          metricValue: true,
          gamesPlayed: true,
          user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
        },
      },
    },
  },
} as const;

// ─── listParticipants ─────────────────────────────────────────────────────────

export const listParticipants = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));

    // ── Authorization ─────────────────────────────────────────────────────────
    //  - managers (admin/owner/co-organizer) → full participant data
    //  - everyone else                       → only on PUBLIC tournaments, and
    //                                           with PII (dni / payment) stripped
    const canManage = canManageTournament(tournament, req);
    if (!canManage && !tournament.isPublic) {
      return next(forbidden("No tienes acceso a los participantes de este torneo"));
    }

    // ── Pagination: OPT-IN only ──
    // By default we return ALL participants — the bracket, seeding and the
    // participant list all need the full set, and the tab counter reads the
    // array length. Pagination is applied only when the client explicitly
    // sends a `limit` (or `offset`) query param.
    const hasPaging = req.query.limit !== undefined || req.query.offset !== undefined;
    const limit  = hasPaging ? Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000) : undefined;
    const offset = hasPaging ? Math.max(Number(req.query.offset) || 0, 0) : undefined;

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where: { tournamentId: req.params.id },
        orderBy: [{ seed: "asc" }, { registeredAt: "asc" }],
        include: INCLUDE_PARTICIPANT,
        ...(limit  !== undefined ? { take: limit }  : {}),
        ...(offset !== undefined ? { skip: offset } : {}),
      }),
      prisma.participant.count({ where: { tournamentId: req.params.id } }),
    ]);

    // ── Enrich team-member metrics from PlayerRecord for legacy rows ──────────
    // Members inscribed before TeamMember.metricValue existed will have null.
    // Fall back to their historical average from PlayerRecord.
    const membersWithoutMetric = participants
      .flatMap(p => p.team?.members ?? [])
      .filter(m => m.metricValue == null);

    if (membersWithoutMetric.length > 0) {
      const names = [...new Set(membersWithoutMetric.map(m => m.user.name.toLowerCase().trim()))];

      const records = await prisma.playerRecord.findMany({
        where: { name: { in: names, mode: "insensitive" } },
        select: { name: true, mpr: true, ppd: true, combined: true },
      });

      // Build map: normalized name → average of the relevant metric
      const metricField = tournament.metric === "mpr" ? "mpr"
        : tournament.metric === "ppd" ? "ppd"
        : "combined";

      const sumMap = new Map<string, { sum: number; count: number }>();
      for (const r of records) {
        const key = r.name.toLowerCase().trim();
        const val = r[metricField as "mpr" | "ppd" | "combined"];
        if (val == null) continue;
        const existing = sumMap.get(key) ?? { sum: 0, count: 0 };
        existing.sum += val; existing.count++;
        sumMap.set(key, existing);
      }

      // Patch the response objects in place
      for (const p of participants) {
        if (!p.team?.members) continue;
        for (const m of p.team.members as Array<{ metricValue: number | null; user: { name: string } }>) {
          if (m.metricValue != null) continue;
          const entry = sumMap.get(m.user.name.toLowerCase().trim());
          if (entry && entry.count > 0) {
            m.metricValue = Math.round((entry.sum / entry.count) * 100) / 100;
          }
        }
      }
    }

    // ── Strip PII for non-managers (public viewers / players) ──────────────────
    // Names, seeds, teams, levels and metrics are public; DNI and payment info
    // are organizer-only.
    const data = canManage
      ? participants
      : participants.map(({ dni, paymentStatus, paymentMethod, ...rest }) => rest);

    const effOffset = offset ?? 0;
    const effLimit  = limit ?? total;
    return res.json({
      data,
      metricPlayers: tournament.metricPlayers ?? null,
      pagination: { offset: effOffset, limit: effLimit, total, hasMore: effOffset + participants.length < total },
    });
  } catch (err) {
    next(err);
  }
};

// ─── addParticipant (individual / parejas_ciegas) ─────────────────────────────

const addSchema = z.object({
  entityId:      z.string(),
  seed:          z.number().int().positive().optional(),
  metricValue:   z.number().optional(),
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  paymentMethod: z.enum(["cash", "card"]).nullable().optional(),
  level:         z.string().optional(),
  dni:           z.string().optional(),
  teamName:      z.string().optional(),
  provincia:     z.string().optional(),
});

export const addParticipant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { participants: true } }, coOrganizers: { select: selectCoOrg } },
    });
    if (!tournament) return next(notFound("Tournament"));

    const { entityId, seed, metricValue, paymentStatus, paymentMethod, level, dni, teamName, provincia } = addSchema.parse(req.body);

    const isOrganizer = canManageTournament(tournament, req);
    const isSelfRegister = entityId === req.user!.userId && isIndividualType(tournament.participantType);

    if (!isOrganizer && !isSelfRegister) {
      return next(forbidden("Solo el organizador puede añadir otros participantes"));
    }
    if (!isOrganizer && tournament.status !== "registration") {
      return next(badRequest("Las inscripciones no están abiertas"));
    }
    // Self-registering players must respect the allowPlayerReg flag
    if (isSelfRegister && !tournament.allowPlayerReg) {
      return next(badRequest("Las inscripciones de jugadores no están habilitadas para este torneo"));
    }
    if (tournament.status !== "registration") {
      return next(badRequest("El torneo ya está en curso o finalizado"));
    }
    if (!isIndividualType(tournament.participantType)) {
      return next(badRequest("Este torneo requiere inscripción por grupos"));
    }
    if (tournament.maxParticipants > 0 && tournament._count.participants >= tournament.maxParticipants) {
      return next(badRequest("El torneo está completo"));
    }

    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: entityId } });
    if (!user) return next(notFound("User"));

    // ── maxMetric check ─────────────────────────────────────────────────────────
    // Use the provided metricValue if supplied; otherwise look up from playerRecord by DNI.
    // Works even when tournament.metric is null — if maxMetric is set it must be enforced.
    if (tournament.maxMetric != null) {
      const metricField = (tournament.metric ?? "mpr") as "ppd" | "mpr" | "combined";
      let effectiveMetric: number | null = metricValue ?? null;

      if (effectiveMetric == null && user.dni) {
        const rec = await prisma.playerRecord.findFirst({
          where: { dni: { equals: user.dni, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          select: { ppd: true, mpr: true, combined: true },
        });
        if (rec) effectiveMetric = rec[metricField] ?? null;
      }

      if (effectiveMetric != null && effectiveMetric > tournament.maxMetric) {
        return next(badRequest(
          `La media del jugador (${effectiveMetric.toFixed(2)}) supera el límite del torneo (${tournament.maxMetric.toFixed(2)})`
        ));
      }
    }

    const existing = await prisma.participant.findUnique({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: entityId } },
    });
    if (existing) return next(badRequest("Este participante ya está inscrito"));

    const participant = await prisma.participant.create({
      data: {
        tournamentId:      req.params.id,
        entityType:        tournament.participantType as any,
        userId:            entityId,
        seed,
        metricValue:       metricValue   ?? null,
        paymentStatus:     paymentStatus ?? null,
        paymentMethod:     paymentMethod ?? null,
        level:             level         ?? null,
        dni:               dni           ?? null,
        teamName:          teamName      ?? null,
        provincia:         provincia     ?? null,
        // Self-registrations require organizer approval — same as playerInscribe
        inscriptionStatus: isSelfRegister ? "pending_web" : undefined,
      },
      include: INCLUDE_PARTICIPANT,
    });

    // Only log when an organizer explicitly adds a participant (not self-registration)
    if (!isSelfRegister) {
      const participantName = user.name;
      audit({ req, action: "participant.add", entityType: "participant", entityId: participant.id, entityName: participantName, details: { tournamentId: req.params.id } });
    }
    return res.status(201).json({ data: participant });
  } catch (err) {
    next(err);
  }
};

// ─── addGroupParticipant (parejas / trios / equipos) ──────────────────────────

const addGroupSchema = z.object({
  groupName:     z.string().min(1),
  playerIds:     z.array(z.string()).min(2).max(7),
  metricValues:  z.record(z.string(), z.number()).optional(),         // userId → metric
  gamesValues:   z.record(z.string(), z.number().int()).optional(),   // userId → games played
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  paymentMethod: z.enum(["cash", "card"]).nullable().optional(),
});

// Minimum games below which a player is flagged for organizer review.
export const MIN_GAMES_FOR_REVIEW = 18;

export const addGroupParticipant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { participants: true } }, levels: true, coOrganizers: { select: selectCoOrg } },
    });
    if (!tournament) return next(notFound("Tournament"));

    if (!canManageTournament(tournament, req)) return next(forbidden("Solo el organizador puede inscribir grupos"));
    if (tournament.status !== "registration") {
      return next(badRequest("El torneo ya está en curso o finalizado"));
    }
    if (!isGroupType(tournament.participantType)) {
      return next(badRequest("Este torneo no acepta inscripciones por grupos"));
    }
    if (tournament.maxParticipants > 0 && tournament._count.participants >= tournament.maxParticipants) {
      return next(badRequest("El torneo está completo"));
    }

    const { groupName, playerIds, metricValues, gamesValues, paymentStatus, paymentMethod } = addGroupSchema.parse(req.body);

    // Validate expected group size (min–max range for equipos, exact for parejas/trios)
    const expectedMax = tournament.participantType === "parejas" ? 2
      : tournament.participantType === "trios"   ? 3
      : (tournament.teamSize ?? 4); // equipos max

    const expectedMin = tournament.participantType === "equipos"
      ? ((tournament as any).teamSizeMin ?? expectedMax)
      : expectedMax;

    if (playerIds.length < expectedMin || playerIds.length > expectedMax) {
      return next(badRequest(
        expectedMin === expectedMax
          ? `Este torneo requiere exactamente ${expectedMax} jugadores por grupo`
          : `Este torneo requiere entre ${expectedMin} y ${expectedMax} jugadores por grupo`
      ));
    }

    // Validate all players exist
    const users = await prisma.user.findMany({ where: { id: { in: playerIds } } });
    if (users.length !== playerIds.length) return next(badRequest("Uno o más jugadores no encontrados"));

    // Validate no duplicate playerIds in the same request
    if (new Set(playerIds).size !== playerIds.length) {
      return next(badRequest("No puedes añadir el mismo jugador dos veces en el mismo grupo"));
    }

    // Validate no player is already inscribed in another group in this tournament
    const alreadyInGroup = await prisma.teamMember.findMany({
      where: {
        userId: { in: playerIds },
        team: {
          participants: { some: { tournamentId: req.params.id } },
        },
      },
      select: { user: { select: { name: true } } },
    });
    if (alreadyInGroup.length > 0) {
      const groupLabel = tournament.participantType === "parejas" ? "pareja"
        : tournament.participantType === "trios" ? "trío"
        : "equipo";
      const names = [...new Set(alreadyInGroup.map(m => m.user.name))].join(", ");
      return next(badRequest(`${names} ya está inscrito en otro ${groupLabel} de este torneo`));
    }

    // ── Effective max metric: explicit field OR maximum of level upper bounds ──
    const levelMaxValues = (tournament.levels ?? [])
      .map((l: { maxValue: number | null }) => l.maxValue)
      .filter((v): v is number => v != null);
    const effectiveMax: number | null = tournament.maxMetric ??
      (levelMaxValues.length > 0 ? Math.max(...levelMaxValues) : null);

    // ── Per-player metric: client-supplied first, fall back to history ────────
    const lastMetrics = await prisma.participant.findMany({
      where:   { userId: { in: playerIds }, metricValue: { not: null } },
      orderBy: { registeredAt: "desc" },
      select:  { userId: true, metricValue: true },
      distinct: ["userId"],
    });
    const historyMap = new Map(lastMetrics.map((p: { userId: string | null; metricValue: number | null }) => [p.userId, p.metricValue]));

    // Build per-member metric map
    const memberMetricMap = new Map<string, number | null>();
    for (const uid of playerIds) {
      const val = metricValues?.[uid] ?? historyMap.get(uid) ?? null;
      memberMetricMap.set(uid, val);
    }

    // ── Effective team metric: SUM of the top-N players by metric ─────────────
    // metricPlayers controls how many top players count (null = all filled players).
    // The limit is checked against the SUM (not the average): e.g. two players of
    // 50 + 50 = 100, which is what the tournament maxMetric is compared against.
    const metricN = tournament.metricPlayers ?? playerIds.length;
    const knownVals = playerIds
      .map(uid => memberMetricMap.get(uid) ?? null)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)          // descending — best first
      .slice(0, metricN);             // top-N

    const storedMetric: number | null = knownVals.length > 0
      ? Math.round(knownVals.reduce((a, b) => a + b, 0) * 100) / 100
      : null;

    // ── Max metric check (against the team's SUMMED metric) ────────────────────
    if (effectiveMax != null && knownVals.length === Math.min(metricN, playerIds.length) && storedMetric != null && storedMetric > effectiveMax) {
      return next(badRequest(
        `La suma de medias del equipo (${storedMetric.toFixed(2)}) supera el límite del torneo (${effectiveMax.toFixed(2)})`
      ));
    }

    // Create Team + TeamMembers (individual metric + games per member)
    const team = await prisma.team.create({
      data: {
        name:       groupName,
        createdById: req.user!.userId,
        members: {
          create: playerIds.map((uid, idx) => ({
            userId:      uid,
            role:        idx === 0 ? "captain" : "member",
            metricValue: memberMetricMap.get(uid) ?? null,
            gamesPlayed: gamesValues?.[uid] ?? null,
          })),
        },
      },
    });

    const participant = await prisma.participant.create({
      data: {
        tournamentId:  req.params.id,
        entityType:    tournament.participantType as any,
        teamId:        team.id,
        paymentStatus: paymentStatus ?? null,
        paymentMethod: paymentMethod ?? null,
        metricValue:   storedMetric,   // combined sum of all players' metrics
      },
      include: INCLUDE_PARTICIPANT,
    });

    audit({ req, action: "participant.add", entityType: "participant", entityId: participant.id, entityName: groupName, details: { tournamentId: req.params.id, playerIds } });
    return res.status(201).json({ data: participant });
  } catch (err) {
    next(err);
  }
};

// ─── playerInscribeGroup: player self-inscribes a full pair/group ──────────────
// The player picks their partner(s) from the historical player database (each
// carries its combined metric + games). The server resolves each partner to a
// real or ghost user account, creates the team, checks the SUMMED metric limit,
// and files the inscription as pending_web (awaiting organizer approval).

const playerGroupSchema = z.object({
  partners: z.array(z.object({
    name:        z.string().min(1),
    dni:         z.string().optional(),
    metricValue: z.number().optional(),
    gamesPlayed: z.number().int().optional(),
  })).min(1).max(6),
  groupName: z.string().optional(),
  note:      z.string().max(500).optional(),   // provenance of a manually-entered metric
  // Fallback values for the inscribing player when they have no historical record.
  // The metric is computed from mpr/ppd (combined = mpr*10 + ppd).
  selfMpr:   z.number().optional(),
  selfPpd:   z.number().optional(),
  selfMetric: z.number().optional(),           // legacy direct value (still accepted)
  selfGames:  z.number().int().optional(),
});

/** Resolve a player record (name + optional dni) to a real or ghost user account. */
async function findOrCreateUserByRecord(name: string, dni?: string | null): Promise<{ id: string; name: string }> {
  let user: { id: string; name: string } | null = null;

  if (dni) {
    const dniNorm = dni.trim().toUpperCase();
    user = await prisma.user.findFirst({
      where:  { dni: dniNorm, NOT: { email: { endsWith: "@torneo.local" } } },
      select: { id: true, name: true },
    });
    if (!user) {
      const slug = dniNorm.toLowerCase().replace(/[^a-z0-9]/g, "");
      user = await prisma.user.findFirst({ where: { email: `${slug}@torneo.local` }, select: { id: true, name: true } });
    }
  }
  if (!user) {
    user = await prisma.user.findFirst({
      where:  { name: { equals: name.trim(), mode: "insensitive" }, NOT: { email: { endsWith: "@torneo.local" } } },
      select: { id: true, name: true },
    }) ?? await prisma.user.findFirst({
      where:  { name: { equals: name.trim(), mode: "insensitive" } },
      select: { id: true, name: true },
    });
  }
  if (!user) {
    const emailSlug = dni
      ? dni.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
      : name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 3).join(".");
    const email  = `${emailSlug || "jugador"}.${crypto.randomBytes(3).toString("hex")}@torneo.local`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    user = await prisma.user.create({
      data:   { name: name.trim().toUpperCase(), email, passwordHash },
      select: { id: true, name: true },
    });
  }
  return user;
}

export const playerInscribeGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "player") return next(forbidden("Solo jugadores pueden auto-inscribirse"));

    const tournament = await prisma.tournament.findUnique({
      where:   { id: req.params.id },
      include: { _count: { select: { participants: true } }, levels: true },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (!tournament.allowPlayerReg) return next(forbidden("Este torneo no acepta inscripciones de jugadores"));
    if (tournament.status !== "registration") return next(badRequest("Las inscripciones no están abiertas"));
    if (!isGroupType(tournament.participantType)) return next(badRequest("Este torneo no es de parejas ni de grupos"));
    if (tournament.maxParticipants > 0 && tournament._count.participants >= tournament.maxParticipants) {
      return next(badRequest("El torneo está completo"));
    }

    const { partners, groupName, note, selfMpr, selfPpd, selfMetric: selfMetricInput, selfGames: selfGamesInput } = playerGroupSchema.parse(req.body);

    // ── Expected group size ────────────────────────────────────────────────────
    const expectedMax = tournament.participantType === "parejas" ? 2
      : tournament.participantType === "trios" ? 3
      : (tournament.teamSize ?? 4);
    const expectedMin = tournament.participantType === "equipos"
      ? ((tournament as any).teamSizeMin ?? expectedMax)
      : expectedMax;
    const totalPlayers = partners.length + 1; // self + partners
    if (totalPlayers < expectedMin || totalPlayers > expectedMax) {
      return next(badRequest(
        expectedMin === expectedMax
          ? `Este torneo requiere ${expectedMax} jugadores (tú y ${expectedMax - 1} compañero${expectedMax - 1 !== 1 ? "s" : ""})`
          : `Este torneo requiere entre ${expectedMin} y ${expectedMax} jugadores`
      ));
    }

    // ── Self: metric + games from own player record ────────────────────────────
    const self = await prisma.user.findUnique({
      where: { id: req.user!.userId }, select: { id: true, name: true, dni: true },
    });
    if (!self) return next(notFound("Usuario"));

    const metricField = (tournament.metric ?? "mpr") as "ppd" | "mpr" | "combined";
    let selfMetric: number | null = null;
    let selfGames:  number | null = null;
    if (self.dni) {
      const rec = await prisma.playerRecord.findFirst({
        where:   { dni: { equals: self.dni, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select:  { ppd: true, mpr: true, combined: true, gamesPlayed: true },
      });
      if (rec) { selfMetric = rec[metricField] ?? null; selfGames = rec.gamesPlayed ?? null; }
    }
    // Player has no historical record → derive the metric from the mpr/ppd they
    // entered (combined = mpr*10 + ppd), matching the tournament's metric type.
    if (selfMetric == null) {
      if (metricField === "mpr" && selfMpr != null) selfMetric = selfMpr;
      else if (metricField === "ppd" && selfPpd != null) selfMetric = selfPpd;
      else if (metricField === "combined" && selfMpr != null && selfPpd != null) {
        selfMetric = Math.round((selfMpr * 10 + selfPpd) * 100) / 100;
      } else if (selfMetricInput != null) {
        selfMetric = selfMetricInput; // legacy direct value
      }
    }
    if (selfGames == null && selfGamesInput != null) selfGames = selfGamesInput;

    // ── Guard: self not already inscribed (by account or DNI) ──────────────────
    const existing = await prisma.participant.findFirst({
      where: {
        tournamentId: tournament.id,
        OR: [
          { userId: self.id },
          ...(self.dni ? [{ dni: { equals: self.dni, mode: "insensitive" as const } }] : []),
        ],
      },
    });
    if (existing) return next(badRequest("Ya estás inscrito en este torneo"));

    // ── Resolve partners → user accounts ───────────────────────────────────────
    const partnerUsers: { id: string; name: string; metricValue: number | null; gamesPlayed: number | null }[] = [];
    for (const p of partners) {
      const u = await findOrCreateUserByRecord(p.name, p.dni);
      partnerUsers.push({ id: u.id, name: u.name, metricValue: p.metricValue ?? null, gamesPlayed: p.gamesPlayed ?? null });
    }

    const allPlayers = [
      { id: self.id, name: self.name, metricValue: selfMetric, gamesPlayed: selfGames, captain: true },
      ...partnerUsers.map(p => ({ ...p, captain: false })),
    ];

    if (new Set(allPlayers.map(p => p.id)).size !== allPlayers.length) {
      return next(badRequest("No puedes inscribirte con el mismo jugador dos veces"));
    }

    // ── Guard: no player already in another group of this tournament ───────────
    const alreadyInGroup = await prisma.teamMember.findMany({
      where: {
        userId: { in: allPlayers.map(p => p.id) },
        team:   { participants: { some: { tournamentId: tournament.id } } },
      },
      select: { user: { select: { name: true } } },
    });
    if (alreadyInGroup.length > 0) {
      const names = [...new Set(alreadyInGroup.map(m => m.user.name))].join(", ");
      return next(badRequest(`${names} ya está inscrito en otra pareja de este torneo`));
    }

    // ── Effective max + SUMMED metric limit ────────────────────────────────────
    const levelMaxValues = (tournament.levels ?? [])
      .map((l: { maxValue: number | null }) => l.maxValue)
      .filter((v): v is number => v != null);
    const effectiveMax: number | null = tournament.maxMetric ??
      (levelMaxValues.length > 0 ? Math.max(...levelMaxValues) : null);

    const metricN = tournament.metricPlayers ?? allPlayers.length;
    const knownVals = allPlayers
      .map(p => p.metricValue)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)
      .slice(0, metricN);
    const storedMetric: number | null = knownVals.length > 0
      ? Math.round(knownVals.reduce((a, b) => a + b, 0) * 100) / 100
      : null;

    if (effectiveMax != null && knownVals.length === Math.min(metricN, allPlayers.length) && storedMetric != null && storedMetric > effectiveMax) {
      return next(badRequest(
        `La suma de medias de la pareja (${storedMetric.toFixed(2)}) supera el límite del torneo (${effectiveMax.toFixed(2)})`
      ));
    }

    // ── Create team + participant (pending organizer approval) ─────────────────
    const teamName = groupName?.trim() || allPlayers.map(p => p.name.split(" ")[0]).join(" & ");
    const team = await prisma.team.create({
      data: {
        name:       teamName,
        createdById: self.id,
        members: {
          create: allPlayers.map(p => ({
            userId:      p.id,
            role:        (p.captain ? "captain" : "member") as any,
            metricValue: p.metricValue,
            gamesPlayed: p.gamesPlayed,
          })),
        },
      },
    });

    const participant = await prisma.participant.create({
      data: {
        tournamentId:      tournament.id,
        entityType:        tournament.participantType as any,
        teamId:            team.id,
        inscriptionStatus: "pending_web",
        paymentStatus:     "pending",
        metricValue:       storedMetric,
        note:              note?.trim() || null,
      },
      include: INCLUDE_PARTICIPANT,
    });

    const lowGames = allPlayers.filter(p => p.gamesPlayed != null && p.gamesPlayed < MIN_GAMES_FOR_REVIEW).map(p => p.name);
    audit({ req, action: "participant.add", entityType: "participant", entityId: participant.id, entityName: teamName, details: { tournamentId: tournament.id, selfInscribed: true, lowGames } });

    return res.status(201).json({
      data: participant,
      message: "Inscripción de pareja enviada. Pendiente de aprobación del organizador.",
    });
  } catch (err) { next(err); }
};

// ─── getMyGroupMetric: the logged-in player's own metric + games ──────────────
// Used by the pair-inscription modal to decide whether it must ask the player
// for their metric (when they have no historical record).
export const getMyGroupMetric = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id }, select: { metric: true, preferredSeason: true },
    });
    if (!tournament) return next(notFound("Tournament"));

    const self = await prisma.user.findUnique({
      where: { id: req.user!.userId }, select: { name: true, dni: true },
    });
    const metricField = (tournament.metric ?? "mpr") as "ppd" | "mpr" | "combined";

    let record = null;
    if (self?.dni) {
      if (tournament.preferredSeason) {
        record = await prisma.playerRecord.findFirst({
          where:   { dni: { equals: self.dni, mode: "insensitive" }, season: tournament.preferredSeason },
          orderBy: { createdAt: "desc" },
          select:  { ppd: true, mpr: true, combined: true, gamesPlayed: true },
        });
      }
      if (!record) {
        record = await prisma.playerRecord.findFirst({
          where:   { dni: { equals: self.dni, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          select:  { ppd: true, mpr: true, combined: true, gamesPlayed: true },
        });
      }
    }

    const metricValue = record ? (record[metricField] ?? null) : null;
    return res.json({
      data: {
        name:        self?.name ?? null,
        metric:      metricField,
        metricValue,
        gamesPlayed: record?.gamesPlayed ?? null,
        hasMetric:   metricValue != null,
      },
    });
  } catch (err) { next(err); }
};

// ─── blindPair: auto-pair parejas_ciegas players ─────────────────────────────
// Splits registered individual players into "high" and "low" by metricValue,
// shuffles each half, then pairs them: high[i] ↔ low[i].

export const blindPair = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));

    if (!canManageTournament(tournament, req)) return next(forbidden());
    if (tournament.participantType !== "parejas_ciegas") {
      return next(badRequest("El torneo no es de tipo Parejas Ciegas"));
    }

    const individual = await prisma.participant.findMany({
      where: { tournamentId: req.params.id, teamId: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { metricValue: "desc" },
    });

    if (individual.length < 2) return next(badRequest("Se necesitan al menos 2 jugadores para emparejar"));
    if (individual.length % 2 !== 0) return next(badRequest(`Número impar de jugadores (${individual.length}). Ajusta las inscripciones antes de emparejar.`));

    const half   = individual.length / 2;
    const high   = individual.slice(0, half);
    const low    = individual.slice(half);

    // Fisher-Yates shuffle each half
    const shuffle = <T>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    shuffle(high);
    shuffle(low);

    const pairs = await prisma.$transaction(async (tx) => {
      const results: { teamName: string; player1: string; player2: string }[] = [];

      for (let i = 0; i < half; i++) {
        const p1 = high[i];
        const p2 = low[i];
        const teamName = `${p1.user?.name ?? "J1"} & ${p2.user?.name ?? "J2"}`;

        const team = await tx.team.create({
          data: {
            name:        teamName,
            createdById: req.user!.userId,
            members: {
              create: [
                { userId: p1.userId!, role: "captain" },
                { userId: p2.userId!, role: "member"  },
              ],
            },
          },
        });

        await tx.participant.update({
          where: { id: p1.id },
          data:  { teamId: team.id, entityType: "parejas" as any, userId: null },
        });
        await tx.participant.delete({ where: { id: p2.id } });

        results.push({ teamName, player1: p1.user?.name ?? "", player2: p2.user?.name ?? "" });
      }

      return results;
    });

    return res.json({ data: { pairs } });
  } catch (err) {
    next(err);
  }
};

// ─── removeParticipant ────────────────────────────────────────────────────────

export const removeParticipant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) {
      return next(forbidden());
    }
    if (tournament.status === "in_progress" || tournament.status === "completed") {
      return next(badRequest("No se puede eliminar participantes de un torneo en curso"));
    }

    const participant = await prisma.participant.findUnique({
      where: { id: req.params.participantId, tournamentId: req.params.id },
    });
    if (!participant) return next(notFound("Participant"));

    if (participant?.level) {
      const levelStarted = await prisma.match.count({
        where: { tournamentId: req.params.id, bracketLevel: participant.level },
      });
      if (levelStarted > 0) {
        return next(badRequest(`No se puede eliminar este participante: el nivel "${participant.level}" ya ha comenzado`));
      }
    }

    await prisma.participant.delete({ where: { id: req.params.participantId, tournamentId: req.params.id } });
    audit({ req, action: "participant.remove", entityType: "participant", entityId: req.params.participantId, details: { tournamentId: req.params.id } });
    return res.json({ data: null, message: "Participant removed" });
  } catch (err) {
    next(err);
  }
};

// ─── randomizeSeeds ───────────────────────────────────────────────────────────

export const randomizeSeeds = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) {
      return next(forbidden());
    }

    const participants = await prisma.participant.findMany({ where: { tournamentId: req.params.id } });
    const seeds = Array.from({ length: participants.length }, (_, i) => i + 1);

    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
    }

    await prisma.$transaction(
      participants.map((p: { id: string }, i: number) =>
        prisma.participant.update({ where: { id: p.id }, data: { seed: seeds[i] } })
      )
    );

    return res.json({ data: null, message: "Seeds randomized" });
  } catch (err) {
    next(err);
  }
};

// ─── updatePayment ────────────────────────────────────────────────────────────

export const updatePayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { paymentStatus, paymentMethod } = z.object({
      paymentStatus: z.enum(["pending", "paid"]),
      paymentMethod: z.enum(["cash", "card"]).nullable().optional(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) {
      return next(forbidden());
    }

    const participant = await prisma.participant.update({
      where: { id: req.params.participantId, tournamentId: req.params.id },
      data:  { paymentStatus, paymentMethod: paymentMethod ?? null },
      include: INCLUDE_PARTICIPANT,
    });
    audit({ req, action: "participant.payment", entityType: "participant", entityId: req.params.participantId, details: { tournamentId: req.params.id, paymentStatus, paymentMethod } });
    return res.json({ data: participant });
  } catch (err) {
    next(err);
  }
};

// ─── updateMetric ─────────────────────────────────────────────────────────────

export const updateMetric = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { metricValue } = z.object({
      metricValue: z.number().nonnegative().nullable(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) {
      return next(forbidden());
    }
    if (tournament.status === "in_progress" || tournament.status === "completed") {
      return next(badRequest("No se puede editar participantes de un torneo en curso"));
    }

    const participant = await prisma.participant.update({
      where:   { id: req.params.participantId, tournamentId: req.params.id },
      data:    { metricValue: metricValue ?? null },
      include: INCLUDE_PARTICIPANT,
    });
    return res.json({ data: participant });
  } catch (err) {
    next(err);
  }
};

// ─── updateSeed ───────────────────────────────────────────────────────────────

export const updateSeed = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { seed } = z.object({ seed: z.number().int().positive() }).parse(req.body);
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) {
      return next(forbidden());
    }
    const participant = await prisma.participant.update({
      where: { id: req.params.participantId, tournamentId: req.params.id },
      data:  { seed },
      include: INCLUDE_PARTICIPANT,
    });
    return res.json({ data: participant });
  } catch (err) {
    next(err);
  }
};
