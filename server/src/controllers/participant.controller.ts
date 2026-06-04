import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { audit } from "../lib/audit";

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
          user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
        },
      },
    },
  },
} as const;

// ─── listParticipants ─────────────────────────────────────────────────────────

export const listParticipants = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));

    const participants = await prisma.participant.findMany({
      where: { tournamentId: req.params.id },
      orderBy: [{ seed: "asc" }, { registeredAt: "asc" }],
      include: INCLUDE_PARTICIPANT,
    });

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

    return res.json({ data: participants, metricPlayers: tournament.metricPlayers ?? null });
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
      include: { _count: { select: { participants: true } } },
    });
    if (!tournament) return next(notFound("Tournament"));

    const { entityId, seed, metricValue, paymentStatus, paymentMethod, level, dni, teamName, provincia } = addSchema.parse(req.body);

    const isOrganizer = tournament.createdById === req.user!.userId
      || req.user!.role === "admin"
      || req.user!.role === "organizer";
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
  metricValues:  z.record(z.string(), z.number()).optional(), // userId → metric
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  paymentMethod: z.enum(["cash", "card"]).nullable().optional(),
});

export const addGroupParticipant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { participants: true } }, levels: true },
    });
    if (!tournament) return next(notFound("Tournament"));

    const isOrganizer = tournament.createdById === req.user!.userId || req.user!.role === "admin" || req.user!.role === "organizer";
    if (!isOrganizer) return next(forbidden("Solo el organizador puede inscribir grupos"));
    if (tournament.status !== "registration") {
      return next(badRequest("El torneo ya está en curso o finalizado"));
    }
    if (!isGroupType(tournament.participantType)) {
      return next(badRequest("Este torneo no acepta inscripciones por grupos"));
    }
    if (tournament.maxParticipants > 0 && tournament._count.participants >= tournament.maxParticipants) {
      return next(badRequest("El torneo está completo"));
    }

    const { groupName, playerIds, metricValues, paymentStatus, paymentMethod } = addGroupSchema.parse(req.body);

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

    // ── Effective team metric: average of top-N players by metric ─────────────
    // metricPlayers controls how many top players are counted (null = all filled players)
    const metricN = tournament.metricPlayers ?? playerIds.length;
    const knownVals = playerIds
      .map(uid => memberMetricMap.get(uid) ?? null)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a)          // descending — best first
      .slice(0, metricN);             // top-N

    const storedMetric: number | null = knownVals.length > 0
      ? Math.round((knownVals.reduce((a, b) => a + b, 0) / knownVals.length) * 100) / 100
      : null;

    // ── Max metric check (against team average) ────────────────────────────────
    if (effectiveMax != null && knownVals.length === Math.min(metricN, playerIds.length) && storedMetric != null && storedMetric > effectiveMax) {
      const names = users.map((u: { name: string }) => u.name).join(" & ");
      return next(badRequest(
        `La media del equipo (${storedMetric.toFixed(2)}) supera el límite del torneo (${effectiveMax.toFixed(2)})`
      ));
    }

    // Create Team + TeamMembers (with individual metric per member)
    const team = await prisma.team.create({
      data: {
        name:       groupName,
        createdById: req.user!.userId,
        members: {
          create: playerIds.map((uid, idx) => ({
            userId:      uid,
            role:        idx === 0 ? "captain" : "member",
            metricValue: memberMetricMap.get(uid) ?? null,
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

// ─── blindPair: auto-pair parejas_ciegas players ─────────────────────────────
// Splits registered individual players into "high" and "low" by metricValue,
// shuffles each half, then pairs them: high[i] ↔ low[i].

export const blindPair = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));

    const isOrganizer = tournament.createdById === req.user!.userId || req.user!.role === "admin" || req.user!.role === "organizer";
    if (!isOrganizer) return next(forbidden());
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

    // Create team per pair, update participant entityType to "parejas", set teamId
    const created: { teamName: string; player1: string; player2: string }[] = [];

    for (let i = 0; i < half; i++) {
      const p1 = high[i];
      const p2 = low[i];
      const teamName = `${p1.user?.name ?? "J1"} & ${p2.user?.name ?? "J2"}`;

      const team = await prisma.team.create({
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

      // Update both individual participants: remove one, update the other to teamId
      await prisma.participant.update({
        where: { id: p1.id },
        data:  { teamId: team.id, entityType: "parejas" as any, userId: null },
      });
      await prisma.participant.delete({ where: { id: p2.id } });

      created.push({ teamName, player1: p1.user?.name ?? "", player2: p2.user?.name ?? "" });
    }

    return res.json({ data: { pairs: created } });
  } catch (err) {
    next(err);
  }
};

// ─── removeParticipant ────────────────────────────────────────────────────────

export const removeParticipant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
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
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
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
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
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
