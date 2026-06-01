import { Response, NextFunction } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { generateBracket, generateRoundRobin, generateSingleElimination, computeRRStandings } from "../services/bracket.service";
import { sendInscriptionPending, sendInscriptionApproved } from "../lib/email";

// Valid odd match lengths — global and per-level
const GLOBAL_BEST_OF = [1, 3, 5, 7] as const;
type GlobalBestOf = typeof GLOBAL_BEST_OF[number];
// Per-level supports a wider range of odd numbers
const isOdd = (n: number) => n % 2 === 1 && n >= 1 && n <= 21;

const levelSchema = z.object({
  name:            z.string().min(1),
  minValue:        z.number(),
  maxValue:        z.number().optional(),
  maxParticipants: z.number().int().optional(), // null/undefined = sin límite
  order:           z.number().int(),
  bestOf:          z.number().int().refine(isOdd).optional(),        // null/undefined = inherit global
  bestOfLosers:    z.number().int().refine(isOdd).nullable().optional(), // null/undefined = same as bestOf
});

// Coerce empty strings to undefined so that unselected radio/select inputs
// from react-hook-form don't cause enum validation failures.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const createSchema = z.object({
  name:            z.string().min(3),
  description:     z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  format:          z.enum(["single_elimination", "double_elimination", "round_robin"]),
  maxParticipants: z.number().int().min(0).max(512), // 0 = sin límite
  participantType: z.enum(["individual", "parejas", "parejas_ciegas", "trios", "equipos"]).default("individual"),
  teamSize:        z.number().int().min(1).max(7).optional(),        // max players per team
  teamSizeMin:     z.number().int().min(1).max(7).optional(),        // min required players per team
  metricPlayers:   z.number().int().min(1).max(7).nullable().optional(), // top-N players for metric avg
  maxMetric:       z.preprocess(emptyToUndefined, z.number().positive().nullable().optional()), // registration cap — null clears it
  rules:           z.preprocess(emptyToUndefined, z.string().max(10000).optional()),
  startDate:       z.preprocess(emptyToUndefined, z.string().datetime({ offset: true }).optional()),
  gameType:        z.preprocess(emptyToUndefined, z.enum(["01", "cricket", "combo"]).optional()),
  metric:          z.preprocess(emptyToUndefined, z.enum(["ppd", "mpr", "combined"]).optional()),
  levels:          z.array(levelSchema).optional(),
  bestOf:          z.number().int().refine((v): v is GlobalBestOf => (GLOBAL_BEST_OF as readonly number[]).includes(v)).optional(),
  bestOfLosers:    z.number().int().refine((v): v is GlobalBestOf => (GLOBAL_BEST_OF as readonly number[]).includes(v)).nullable().optional(),
  winnerOnly:             z.boolean().optional(),
  estimatedMatchMinutes:  z.number().int().min(5).max(240).optional(),
  rrGroupSize:            z.number().int().min(3).max(8).optional(),
  rrAdvancingTeams:       z.number().int().min(2).max(4).optional(),
  allowPlayerReg:         z.boolean().optional(),
});

const updateSchema = createSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const selectOrganizer = { id: true, name: true, avatarUrl: true };

// ─── Controllers ──────────────────────────────────────────────────────────────

export const listTournaments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rawStatus = req.query.status as string | undefined;
    const rawFormat = req.query.format as string | undefined;
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const VALID_STATUSES = ["draft", "registration", "in_progress", "completed", "cancelled"];
    const VALID_FORMATS  = ["single_elimination", "double_elimination", "round_robin"];

    const where = {
      ...(rawStatus && VALID_STATUSES.includes(rawStatus) ? { status: rawStatus as any } : {}),
      ...(rawFormat && VALID_FORMATS.includes(rawFormat)  ? { format: rawFormat as any } : {}),
    };

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          organizer: { select: selectOrganizer },
          _count: { select: { participants: true } },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    const data = tournaments.map((t: typeof tournaments[number]) => ({
      ...t,
      createdBy: t.createdById,
      participantsCount: t._count.participants,
      _count: undefined,
    }));

    return res.json({ data, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

export const getTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        organizer: { select: selectOrganizer },
        _count:    { select: { participants: true } },
        levels:    { orderBy: { order: "asc" } },
      },
    });
    if (!tournament) return next(notFound("Tournament"));

    return res.json({ data: { ...tournament, createdBy: tournament.createdById, participantsCount: tournament._count.participants, _count: undefined } });
  } catch (err) {
    next(err);
  }
};

export const createTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { levels, ...body } = createSchema.parse(req.body);

    const tournament = await prisma.tournament.create({
      data: {
        ...body,
        startDate:  body.startDate ? new Date(body.startDate) : undefined,
        createdById: req.user!.userId,
        // Create levels inline if provided
        levels: levels?.length
          ? { create: levels.map(l => ({ name: l.name, minValue: l.minValue, maxValue: l.maxValue ?? null, maxParticipants: l.maxParticipants ?? null, order: l.order, bestOf: l.bestOf ?? null, bestOfLosers: l.bestOfLosers ?? null })) }
          : undefined,
      },
      include: { organizer: { select: selectOrganizer }, levels: { orderBy: { order: "asc" } } },
    });
    return res.status(201).json({ data: { ...tournament, createdBy: tournament.createdById, participantsCount: 0 } });
  } catch (err) {
    next(err);
  }
};

// ── Shared helper: re-assign all participant metric values for a tournament ───
async function reassignParticipantMetrics(
  tournamentId: string,
  metric: string,
  levels: { name: string; minValue: number; maxValue: number | null; order: number }[]
) {
  const metricFilter = metric === "ppd"
    ? { ppd: { not: null } }
    : metric === "mpr"
      ? { mpr: { not: null } }
      : { combined: { not: null } };

  const participants = await prisma.participant.findMany({
    where: { tournamentId },
    include: { user: { select: { name: true } } },
  });

  for (const p of participants) {
    let rec: { ppd: number | null; mpr: number | null; combined: number | null } | null = null;

    // Prefer lookup by DNI, fall back to user display name
    if (p.dni) {
      rec = await prisma.playerRecord.findFirst({
        where: { dni: p.dni, ...metricFilter },
        orderBy: { createdAt: "desc" },
        select: { ppd: true, mpr: true, combined: true },
      });
    }
    if (!rec && p.user?.name) {
      rec = await prisma.playerRecord.findFirst({
        where: { name: { equals: p.user.name, mode: "insensitive" }, ...metricFilter },
        orderBy: { createdAt: "desc" },
        select: { ppd: true, mpr: true, combined: true },
      });
    }

    if (rec) {
      const mv  = metric === "ppd" ? rec.ppd : metric === "mpr" ? rec.mpr : rec.combined;
      const lvl = resolveLevel(mv, levels);
      await prisma.participant.update({
        where: { id: p.id },
        data: { metricValue: mv, level: lvl },
      });
    }
  }
}

export const updateTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status === "in_progress" || tournament.status === "completed") {
      return next(badRequest("Cannot edit a tournament that is already in progress or completed"));
    }

    const { levels, ...body } = updateSchema.parse(req.body);
    const prevMetric = tournament.metric; // capture before update

    const updated = await prisma.tournament.update({
      where: { id: req.params.id },
      data: {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        // Replace all levels if provided
        ...(levels !== undefined && {
          levels: {
            deleteMany: {},
            create: levels.map(l => ({ name: l.name, minValue: l.minValue, maxValue: l.maxValue ?? null, maxParticipants: l.maxParticipants ?? null, order: l.order, bestOf: l.bestOf ?? null, bestOfLosers: l.bestOfLosers ?? null })),
          },
        }),
      },
      include: {
        organizer: { select: selectOrganizer },
        _count:    { select: { participants: true } },
        levels:    { orderBy: { order: "asc" } },
      },
    });

    // Re-assign participant metricValues when metric changes
    if (updated.metric && updated.metric !== prevMetric) {
      await reassignParticipantMetrics(req.params.id, updated.metric, updated.levels);
    }

    return res.json({ data: { ...updated, createdBy: updated.createdById, participantsCount: updated._count.participants, _count: undefined } });
  } catch (err) {
    next(err);
  }
};

/** POST /tournaments/:id/recalculate-metrics — force re-assign all participant metricValues */
export const recalculateMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { levels: { orderBy: { order: "asc" } } },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (!tournament.metric) {
      return next(badRequest("Este torneo no tiene una métrica configurada"));
    }

    await reassignParticipantMetrics(req.params.id, tournament.metric, tournament.levels);

    // Return updated participants count and a success flag
    return res.json({ data: { ok: true }, message: "Métricas recalculadas correctamente" });
  } catch (err) {
    next(err);
  }
};

export const deleteTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    await prisma.tournament.delete({ where: { id: req.params.id } });
    return res.json({ data: null, message: "Tournament deleted" });
  } catch (err) {
    next(err);
  }
};

/** Helper: generate RR groups + match data for a slice of participants within one level.
 *  Returns the match rows ready for prisma.match.createMany and the rrGroup assignments. */
function buildRRGroups(
  participants: { id: string; seed?: number | null; teamName?: string | null; provincia?: string | null }[],
  rrGroupSize:  number,
  tournamentId: string,
  bracketLevel: string | null,
): {
  matchData:      ReturnType<typeof generateRoundRobin> extends (infer R)[] ? (R & { tournamentId: string; bracketLevel: string | null })[] : never;
  rrAssignments:  { participantId: string; group: string }[];
} {
  // Use seeds to determine group assignment so that "Aleatorizar Seeds" controls
  // which players land in which group.  Seeds are sorted ascending (1 = first pick),
  // then distributed in round-robin order across groups so top seeds are spread evenly:
  //   seeds 1,2,3,4,5,6,7,8 → 2 groups → A:[1,3,5,7]  B:[2,4,6,8]
  // If no participant has a seed yet, fall back to a random Fisher-Yates shuffle.
  const hasAnySeeds = participants.some(p => p.seed != null);
  let ordered: typeof participants;
  if (hasAnySeeds) {
    const seeded   = [...participants].filter(p => p.seed != null).sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const unseeded = [...participants].filter(p => p.seed == null);
    // Shuffle unseeded portion randomly so they don't always cluster at the end
    for (let i = unseeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
    }
    ordered = [...seeded, ...unseeded];
  } else {
    ordered = [...participants];
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }
  const groupCount = Math.ceil(ordered.length / rrGroupSize);
  const groupNames = Array.from({ length: groupCount }, (_, i) => String.fromCharCode(65 + i));
  const groups     = new Map<string, typeof participants>(groupNames.map(g => [g, []]));
  ordered.forEach((p, i) => groups.get(groupNames[i % groupCount])!.push(p));

  const matchData: any[]                                       = [];
  const rrAssignments: { participantId: string; group: string }[] = [];

  for (const [groupName, gp] of groups.entries()) {
    if (gp.length < 2) continue;
    const groupMatches = generateRoundRobin(
      gp.map(p => ({
        id:        p.id,
        seed:      p.seed      ?? null,
        teamName:  p.teamName  ?? null,
        provincia: p.provincia ?? null,
      })),
      groupName
    );
    matchData.push(...groupMatches.map(m => ({ ...m, tournamentId, bracketLevel })));
    gp.forEach(p => rrAssignments.push({ participantId: p.id, group: groupName }));
  }
  return { matchData, rrAssignments };
}

// Assign a level name to a participant based on metricValue vs level thresholds.
// Sort DESCENDING so the highest-order (most exclusive) level is checked first.
// This prevents an open-ended lower level (maxValue=null) from swallowing
// players that should belong to a higher level.
function resolveLevel(
  metricValue: number | null,
  levels: { name: string; minValue: number; maxValue: number | null; order: number }[]
): string | null {
  if (metricValue == null || levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => b.order - a.order); // highest tier first
  const found = sorted.find(l => {
    const above = metricValue >= l.minValue;
    const below = l.maxValue == null || metricValue <= l.maxValue;
    return above && below;
  });
  return found?.name ?? null;
}

// ── Auto-advance BYE winners into the next round's participant slots ──────────
async function resolveByes(tournamentId: string, bracketLevel: string | null) {
  const byeMatches = await prisma.match.findMany({
    where: { tournamentId, bracketLevel, status: "bye" },
    orderBy: { round: "asc" },
  });

  for (const bye of byeMatches) {
    if (!bye.winnerId) continue;

    const nextRound   = bye.round + 1;
    const nextPos     = Math.floor(bye.position / 2);
    const isFirstSlot = bye.position % 2 === 0;

    const nextMatch = await prisma.match.findFirst({
      where: { tournamentId, bracketLevel, round: nextRound, position: nextPos, bracketSide: "winners" },
    });
    if (!nextMatch) continue;

    await prisma.match.update({
      where: { id: nextMatch.id },
      data: isFirstSlot ? { participant1Id: bye.winnerId } : { participant2Id: bye.winnerId },
    });
  }
}

export const startTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        levels: { orderBy: { order: "asc" } },
      },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status !== "registration") {
      return next(badRequest("Tournament must be in registration status to start"));
    }
    if (tournament.participants.length < 2) {
      return next(badRequest("Tournament needs at least 2 participants to start"));
    }

    const allMatchData: any[] = [];
    // For multi-level RR: collect rrGroup assignments to apply after the transaction
    const allRRAssignments: { participantId: string; group: string }[] = [];

    if (tournament.levels && tournament.levels.length > 0) {
      // ── Multi-level: one bracket per level ──────────────────────────────────
      // Group participants by level
      const groups = new Map<string | null, typeof tournament.participants>();

      for (const p of tournament.participants) {
        // Use stored level field first; fall back to metricValue computation
        const levelName =
          p.level ?? resolveLevel(p.metricValue as number | null, tournament.levels);
        const key = levelName ?? "__no_level__";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }

      // Generate brackets in level order
      for (const lvl of tournament.levels) {
        const levelParticipants = groups.get(lvl.name) ?? [];
        if (levelParticipants.length < 2) continue;

        if (tournament.format === "round_robin") {
          // Split level participants into RR groups
          const { matchData, rrAssignments } = buildRRGroups(
            levelParticipants, tournament.rrGroupSize ?? 4, tournament.id, lvl.name
          );
          allMatchData.push(...matchData);
          allRRAssignments.push(...rrAssignments);
        } else {
          const levelMatches = generateBracket(tournament.format, levelParticipants);
          allMatchData.push(
            ...levelMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: lvl.name }))
          );
        }
      }

      // Participants without a matching level → null bracketLevel
      const unleveled = groups.get("__no_level__") ?? [];
      if (unleveled.length >= 2) {
        if (tournament.format === "round_robin") {
          const { matchData, rrAssignments } = buildRRGroups(
            unleveled, tournament.rrGroupSize ?? 4, tournament.id, null
          );
          allMatchData.push(...matchData);
          allRRAssignments.push(...rrAssignments);
        } else {
          const unleveledMatches = generateBracket(tournament.format, unleveled);
          allMatchData.push(
            ...unleveledMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: null }))
          );
        }
      }

      if (allMatchData.length === 0) {
        return next(badRequest("Ningún nivel tiene suficientes participantes (mínimo 2) para generar un cuadrante"));
      }
    } else if (tournament.format === "round_robin") {
      // ── Round Robin with groups ──────────────────────────────────────────────
      const groupSize = tournament.rrGroupSize ?? 4;
      const participants = [...tournament.participants];
      // Shuffle randomly
      for (let i = participants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participants[i], participants[j]] = [participants[j], participants[i]];
      }

      const groupCount = Math.ceil(participants.length / groupSize);
      const groupNames = Array.from({ length: groupCount }, (_, i) =>
        String.fromCharCode(65 + i) // A, B, C...
      );

      // Balanced round-robin assignment: deal cards to groups in order
      const groups = new Map<string, typeof participants[number][]>(
        groupNames.map(g => [g, []])
      );
      participants.forEach((p, i) => {
        const groupName = groupNames[i % groupCount];
        groups.get(groupName)!.push(p);
      });

      // Generate RR matches per group and set participant rrGroup
      for (const groupName of groupNames) {
        const groupParticipants = groups.get(groupName)!;
        if (groupParticipants.length < 2) continue;
        const groupMatches = generateRoundRobin(
          groupParticipants.map(p => ({
            id:        p.id,
            seed:      p.seed ?? null,
            teamName:  p.teamName  ?? null,
            provincia: p.provincia ?? null,
          })),
          groupName
        );
        allMatchData.push(
          ...groupMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: null }))
        );
      }

      if (allMatchData.length === 0) {
        return next(badRequest("No hay suficientes participantes para generar los grupos"));
      }

      // Assign rrGroup to participants (after transaction, in separate updates)
      await prisma.$transaction([
        prisma.tournament.update({ where: { id: tournament.id }, data: { status: "in_progress" } }),
        prisma.match.createMany({ data: allMatchData }),
      ]);

      for (const [groupName, groupParticipants] of groups.entries()) {
        for (const p of groupParticipants) {
          await prisma.participant.update({ where: { id: p.id }, data: { rrGroup: groupName } });
        }
      }

      return res.json({ data: null, message: "Tournament started" });
    } else {
      // ── Single bracket (original behaviour) ─────────────────────────────────
      const matches = generateBracket(tournament.format, tournament.participants);
      allMatchData.push(...matches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: null })));
    }

    await prisma.$transaction([
      prisma.tournament.update({ where: { id: tournament.id }, data: { status: "in_progress" } }),
      prisma.match.createMany({ data: allMatchData }),
    ]);

    // Apply rrGroup assignments for multi-level RR (collected above)
    for (const { participantId, group } of allRRAssignments) {
      await prisma.participant.update({ where: { id: participantId }, data: { rrGroup: group } });
    }

    // Advance BYE winners into next-round slots for each level (only for non-RR formats)
    if (tournament.format !== "round_robin") {
      if (tournament.levels && tournament.levels.length > 0) {
        for (const lvl of tournament.levels) {
          await resolveByes(tournament.id, lvl.name);
        }
        const hasUnleveled = allMatchData.some(m => m.bracketLevel === null);
        if (hasUnleveled) await resolveByes(tournament.id, null);
      } else {
        await resolveByes(tournament.id, null);
      }
    }

    return res.json({ data: null, message: "Tournament started" });
  } catch (err) {
    next(err);
  }
};

/** POST /tournaments/:id/start-level { levelName } — generate bracket for a single level */
export const startLevel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { levelName } = z.object({ levelName: z.string().min(1) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { participants: true, levels: { orderBy: { order: "asc" } } },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status !== "registration") {
      return next(badRequest("El torneo debe estar en inscripciones para iniciar un nivel"));
    }
    if (!tournament.levels.find(l => l.name === levelName)) {
      return next(badRequest(`El nivel "${levelName}" no existe en este torneo`));
    }

    // Guard: level must not have been started already
    const existing = await prisma.match.count({
      where: { tournamentId: req.params.id, bracketLevel: levelName },
    });
    if (existing > 0) {
      return next(badRequest(`El nivel "${levelName}" ya ha sido iniciado`));
    }

    // Participants that belong to this level
    const levelParticipants = tournament.participants.filter(p => {
      const assigned = p.level ?? resolveLevel(p.metricValue as number | null, tournament.levels);
      return assigned === levelName;
    });
    if (levelParticipants.length < 2) {
      return next(badRequest(`El nivel "${levelName}" necesita al menos 2 participantes para generar un cuadrante`));
    }

    let matchCount: number;

    if (tournament.format === "round_robin") {
      // ── Round Robin: split level participants into groups ────────────────────
      const { matchData, rrAssignments } = buildRRGroups(
        levelParticipants, tournament.rrGroupSize ?? 4, tournament.id, levelName
      );
      await prisma.match.createMany({ data: matchData });
      matchCount = matchData.length;

      // Clear stale rrGroup and assign fresh
      await prisma.participant.updateMany({
        where: { id: { in: levelParticipants.map(p => p.id) } },
        data: { rrGroup: null },
      });
      for (const { participantId, group } of rrAssignments) {
        await prisma.participant.update({ where: { id: participantId }, data: { rrGroup: group } });
      }
    } else {
      // ── SE / DE: generate bracket and resolve byes ───────────────────────────
      const levelMatches = generateBracket(tournament.format, levelParticipants);
      await prisma.match.createMany({
        data: levelMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: levelName })),
      });
      matchCount = levelMatches.length;
      await resolveByes(tournament.id, levelName);
    }

    // If every configured level now has matches → transition tournament to in_progress
    const startedRows = await prisma.match.findMany({
      where: { tournamentId: req.params.id, bracketLevel: { not: null } },
      distinct: ["bracketLevel"],
      select: { bracketLevel: true },
    });
    const startedNames = new Set(startedRows.map(r => r.bracketLevel!));
    const allStarted = tournament.levels.every(l => startedNames.has(l.name));
    if (allStarted) {
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "in_progress" } });
    }

    return res.json({
      data: { levelName, matchCount },
      message: `Nivel "${levelName}" iniciado`,
    });
  } catch (err) { next(err); }
};

export const finalizeTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { matches: true },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status !== "in_progress") {
      return next(badRequest("Tournament must be in progress to finalize"));
    }

    const pendingMatches = tournament.matches.filter((m: { status: string; round: number; participant1Id: string | null; participant2Id: string | null }) => {
      if (m.status !== "pending" && m.status !== "in_progress") return false;
      // Round 100 is the bracket-reset: skip it if it was never activated (no participants seeded)
      if (m.round === 100 && m.participant1Id === null && m.participant2Id === null) return false;
      return true;
    });
    if (pendingMatches.length > 0) {
      return next(badRequest(`There are still ${pendingMatches.length} unfinished matches`));
    }

    await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "completed" } });
    return res.json({ data: null, message: "Tournament finalized" });
  } catch (err) {
    next(err);
  }
};

export const resetTournament = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status !== "in_progress" && tournament.status !== "registration") {
      return next(badRequest("Solo se puede reiniciar un torneo en curso o en inscripciones"));
    }
    // Check that there are actually matches to delete (avoid no-op reset on fresh tournaments)
    const matchCount = await prisma.match.count({ where: { tournamentId: tournament.id } });
    if (matchCount === 0) {
      return next(badRequest("No hay cuadrantes generados para reiniciar"));
    }
    // Delete all matches and ensure status is registration
    await prisma.$transaction([
      prisma.match.deleteMany({ where: { tournamentId: tournament.id } }),
      prisma.tournament.update({ where: { id: tournament.id }, data: { status: "registration" } }),
    ]);
    return res.json({ data: null, message: "Tournament reset to registration" });
  } catch (err) {
    next(err);
  }
};

/** Delete and regenerate a single bracket level.
 *  Body: { levelName: string }
 *  Uses the fixed resolveLevel (descending order) to reassign participants. */
export const resetLevel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { levelName } = z.object({ levelName: z.string().min(1) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        participants: true,
        levels: { orderBy: { order: "asc" } },
      },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const levelDef = tournament.levels.find(l => l.name === levelName);
    if (!levelDef) return next(badRequest(`El nivel "${levelName}" no existe en este torneo`));

    // Delete existing matches for this level
    await prisma.match.deleteMany({ where: { tournamentId: tournament.id, bracketLevel: levelName } });

    // ── Re-assign ALL participants to the correct level using the corrected resolveLevel.
    // We IGNORE the stored p.level here because it may have been calculated with the old
    // ascending-sort bug. We recalculate from metricValue every time.
    for (const p of tournament.participants) {
      const newLevel = resolveLevel(p.metricValue as number | null, tournament.levels);
      if (p.level !== newLevel) {
        await prisma.participant.update({ where: { id: p.id }, data: { level: newLevel } });
      }
    }

    // Determine participants for this level (always from metricValue, ignoring stale p.level)
    const levelParticipants = tournament.participants.filter(p =>
      resolveLevel(p.metricValue as number | null, tournament.levels) === levelName
    );

    if (levelParticipants.length < 2) {
      // Leave level empty (matches deleted); transition tournament back to registration if needed
      const startedCount = await prisma.match.count({
        where: { tournamentId: tournament.id, bracketLevel: { not: null } },
      });
      if (startedCount === 0) {
        await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "registration" } });
      }
      return res.json({ data: { levelName, matchCount: 0 }, message: `Nivel "${levelName}" vaciado (insuficientes participantes)` });
    }

    let matchCount: number;

    if (tournament.format === "round_robin") {
      // ── Round Robin: regenerate groups ──────────────────────────────────────
      const { matchData, rrAssignments } = buildRRGroups(
        levelParticipants, tournament.rrGroupSize ?? 4, tournament.id, levelName
      );
      await prisma.match.createMany({ data: matchData });
      matchCount = matchData.length;

      // Re-assign rrGroup for level participants
      await prisma.participant.updateMany({
        where: { id: { in: levelParticipants.map(p => p.id) } },
        data: { rrGroup: null },
      });
      for (const { participantId, group } of rrAssignments) {
        await prisma.participant.update({ where: { id: participantId }, data: { rrGroup: group } });
      }
    } else {
      // ── SE / DE ──────────────────────────────────────────────────────────────
      const levelMatches = generateBracket(tournament.format, levelParticipants);
      await prisma.match.createMany({
        data: levelMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: levelName })),
      });
      matchCount = levelMatches.length;
      await resolveByes(tournament.id, levelName);
    }

    // Ensure tournament is in_progress if at least one level is active
    if (tournament.status === "registration") {
      const hasAny = await prisma.match.count({ where: { tournamentId: tournament.id } });
      if (hasAny > 0) {
        await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "in_progress" } });
      }
    }

    return res.json({
      data: { levelName, matchCount },
      message: `Nivel "${levelName}" regenerado con ${levelParticipants.length} participante${levelParticipants.length !== 1 ? "s" : ""}`,
    });
  } catch (err) { next(err); }
};

export const openRegistration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.status !== "draft") {
      return next(badRequest("Only draft tournaments can be opened for registration"));
    }
    await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "registration" } });
    return res.json({ data: null, message: "Registration opened" });
  } catch (err) {
    next(err);
  }
};

// ─── Round Robin endpoints ────────────────────────────────────────────────────

/** GET /tournaments/:id/rr-standings — compute standings per group
 *  Optional query param: ?level=NivelX  — filter to a specific bracketLevel */
export const getRRStandings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));

    const advancingCount = tournament.rrAdvancingTeams ?? 2;

    // Optional bracketLevel filter for multi-level tournaments
    const bracketLevelFilter = req.query.level !== undefined
      ? { bracketLevel: (req.query.level as string) || null }
      : {};

    const participantInclude = {
      user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
      team: { select: { id: true, name: true, logoUrl: true } },
    };

    // Fetch RR matches (filtered by bracketLevel when provided)
    const matches = await prisma.match.findMany({
      where: { tournamentId: req.params.id, rrGroup: { not: null }, ...bracketLevelFilter },
      include: {
        participant1: { include: participantInclude },
        participant2: { include: participantInclude },
        participant3: { include: participantInclude },
        winner:       { include: participantInclude },
      },
    });

    // Derive participant IDs from matches (works for multi-level where rrGroup letters repeat)
    const pIds = [...new Set([
      ...matches.map((m: any) => m.participant1Id),
      ...matches.map((m: any) => m.participant2Id),
      ...matches.map((m: any) => m.participant3Id),
    ].filter((id): id is string => id != null))];

    const participants = await prisma.participant.findMany({
      where: { id: { in: pIds } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
        team: { select: { id: true, name: true, logoUrl: true } },
      },
    });

    // Group by rrGroup name (derived from matches so multi-level works correctly)
    const groupNames = [...new Set(matches.map((m: any) => m.rrGroup as string))].sort();

    const groups = groupNames.map(groupName => {
      const groupParticipants = participants.filter(p => p.rrGroup === groupName);
      const groupMatches = matches.filter(m => m.rrGroup === groupName);

      const standingEntries = computeRRStandings(groupParticipants, groupMatches, advancingCount);

      // Enrich with participant data
      const standings = standingEntries.map(e => ({
        ...e,
        participant: groupParticipants.find(p => p.id === e.participantId),
      }));

      const allMatchesDone = groupMatches
        .filter(m => m.status !== "bye")
        .every(m => m.status === "completed");

      const reviewed = groupMatches
        .filter(m => m.status !== "bye")
        .every(m => m.reviewed);

      const hasTiebreaker = standings.some(s => s.needsTiebreaker);

      return { name: groupName, standings, allMatchesDone, reviewed, hasTiebreaker, matches: groupMatches };
    });

    return res.json({ data: { groups } });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/approve-group { group: "A", bracketLevel?: "Nivel 1" } — lock results */
export const approveGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { group, bracketLevel } = z.object({
      group:        z.string().min(1),
      bracketLevel: z.string().min(1).nullable().optional(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    // Verify all non-bye matches in this group are completed
    const pending = await prisma.match.count({
      where: { tournamentId: req.params.id, rrGroup: group, status: { notIn: ["completed", "bye"] }, ...levelFilter },
    });
    if (pending > 0) {
      return next(badRequest(`Aún hay ${pending} partido(s) sin completar en el Grupo ${group}`));
    }

    await prisma.match.updateMany({
      where: { tournamentId: req.params.id, rrGroup: group, ...levelFilter },
      data: { reviewed: true },
    });

    return res.json({ data: null, message: `Grupo ${group} aprobado` });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/reset-ko { bracketLevel?: "Nivel 1" } — delete KO matches */
export const resetKO = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bracketLevel } = z.object({
      bracketLevel: z.string().min(1).nullable().optional(),
    }).parse(req.body ?? {});

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    const deleted = await prisma.match.deleteMany({
      where: { tournamentId: req.params.id, rrGroup: null, ...levelFilter },
    });

    if (deleted.count === 0) {
      return next(badRequest("No hay cuadro KO generado para reiniciar"));
    }

    return res.json({ data: null, message: "Cuadro KO reiniciado" });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/launch-ko { bracketLevel?: "Nivel 1" } — create KO bracket */
export const launchKO = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bracketLevel } = z.object({
      bracketLevel: z.string().min(1).nullable().optional(),
    }).parse(req.body ?? {});

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const advancingCount = tournament.rrAdvancingTeams ?? 2;
    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    // Ensure no KO matches already exist for this level
    const existingKO = await prisma.match.count({
      where: { tournamentId: req.params.id, rrGroup: null, status: { not: "bye" }, bracketSide: "winners", ...levelFilter },
    });
    if (existingKO > 0) {
      return next(badRequest("El cuadro KO ya ha sido generado"));
    }

    // Check all RR groups for this level are reviewed
    const unreviewed = await prisma.match.count({
      where: { tournamentId: req.params.id, rrGroup: { not: null }, reviewed: false, status: { not: "bye" }, ...levelFilter },
    });
    if (unreviewed > 0) {
      return next(badRequest("Todos los grupos deben estar aprobados antes de lanzar el KO"));
    }

    // Fetch matches and participants for this level
    const matches = await prisma.match.findMany({
      where: { tournamentId: req.params.id, rrGroup: { not: null }, ...levelFilter },
    });

    // Derive participant IDs from matches (correct for multi-level with same-letter groups)
    const pIds = [...new Set([
      ...matches.map(m => m.participant1Id),
      ...matches.map(m => m.participant2Id),
    ].filter((id): id is string => id != null))];

    const participants = await prisma.participant.findMany({
      where: { id: { in: pIds } },
    });

    const groupNames = [...new Set(matches.map(m => m.rrGroup!))].sort();

    // Build standings per group
    const groupStandings: { groupName: string; standings: ReturnType<typeof computeRRStandings> }[] = [];
    for (const groupName of groupNames) {
      const groupParticipants = participants.filter(p => p.rrGroup === groupName);
      const groupMatches = matches.filter(m => m.rrGroup === groupName);
      const standings = computeRRStandings(groupParticipants, groupMatches, advancingCount);
      groupStandings.push({ groupName, standings });
    }

    // Cross-seeded ordering — avoid rematches in R1 and R2 of the KO bracket.
    //
    // Standard seeding (rank1-A, rank1-B, …, rank2-A, rank2-B, …) works for G=2
    // but for G≥3 it puts same-group players in the same bracket half, so they
    // can meet in the semis.
    //
    // Fix: keep rank-1 teams in group order (seeds 1…G) and rotate the rank-2
    // list by floor(G/2).  seededPairs(2G) then pairs seed i with seed (2G+1-i),
    // which ensures each SF half contains exactly one player from every group.
    //
    // Example G=4, shift=2:
    //   rank1 = [1A,1B,1C,1D]   rank2_shifted = [2C,2D,2A,2B]
    //   seeds  =  1  2  3  4  5   6   7   8
    //   seededPairs(8) QF matches: (1,8)=1Avs2B, (4,5)=1Dvs2C, (2,7)=1Bvs2D, (3,6)=1Cvs2A
    //   SF1 half groups: {A,B,D,C} ✓   SF2 half groups: {B,A,C,D} ✓
    const G = groupStandings.length;
    const seedOrder: string[] = [];

    if (advancingCount === 2 && G >= 3) {
      // Build rank-1 and rank-2 pots in group order
      const pot1: string[] = [];
      const pot2: string[] = [];
      for (const { standings } of groupStandings) {
        const r1 = standings.find(s => s.rank === 1);
        const r2 = standings.find(s => s.rank === 2);
        if (r1) pot1.push(r1.participantId);
        if (r2) pot2.push(r2.participantId);
      }
      // Rotate pot2 by floor(G/2) so SF halves span all groups
      const shift = Math.floor(G / 2);
      const pot2Rotated = [...pot2.slice(shift), ...pot2.slice(0, shift)];
      seedOrder.push(...pot1, ...pot2Rotated);
    } else {
      // G=2 or advancingCount≠2: original interleaving works correctly
      for (let rank = 1; rank <= advancingCount; rank++) {
        for (const { standings } of groupStandings) {
          const entry = standings.find(s => s.rank === rank);
          if (entry) seedOrder.push(entry.participantId);
        }
      }
    }

    if (seedOrder.length < 2) {
      return next(badRequest("No hay suficientes participantes clasificados para el KO"));
    }

    // Generate SE bracket with seeded participants
    const koParticipants = seedOrder.map((id, idx) => ({ id, seed: idx + 1 }));
    const koMatches = generateSingleElimination(koParticipants);

    // For multi-level tournaments, KO matches inherit the level's bracketLevel
    const koBracketLevel = bracketLevel !== undefined ? (bracketLevel ?? null) : null;

    await prisma.match.createMany({
      data: koMatches.map(m => ({ ...m, tournamentId: tournament.id, bracketLevel: koBracketLevel })),
    });

    // Resolve byes
    await resolveByes(tournament.id, koBracketLevel);

    return res.json({ data: null, message: "Cuadro KO generado" });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/create-tiebreaker { participantIds, group, bracketLevel? } */
export const createTiebreakerMatch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { participantIds, group, bracketLevel } = z.object({
      participantIds: z.array(z.string()).min(2).max(3),
      group:          z.string().min(1),
      bracketLevel:   z.string().min(1).nullable().optional(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    // Guard: only one tiebreaker allowed per group (scoped to level)
    const existingTiebreaker = await prisma.match.findFirst({
      where: { tournamentId: req.params.id, rrGroup: group, isTiebreaker: true, ...levelFilter },
    });
    if (existingTiebreaker) {
      return next(badRequest(`Ya existe un partido de desempate para el Grupo ${group}`));
    }

    // Get existing matches to determine next round/position
    const existing = await prisma.match.findMany({
      where: { tournamentId: req.params.id, rrGroup: group, ...levelFilter },
      orderBy: [{ round: "desc" }, { position: "desc" }],
    });
    const maxRound = existing[0]?.round ?? 1;

    // Create tiebreaker match — supports 2 or 3 participants
    const tiebreakerMatch = await prisma.match.create({
      data: {
        tournamentId: req.params.id,
        round: maxRound + 1,
        position: 0,
        bracketSide: null,
        rrGroup: group,
        isTiebreaker: true,
        participant1Id: participantIds[0],
        participant2Id: participantIds[1],
        participant3Id: participantIds[2] ?? null,
        status: "pending",
        score1: null,
        score2: null,
        winnerId: null,
        bracketLevel: bracketLevel !== undefined ? (bracketLevel ?? null) : null,
      },
      include: {
        participant1: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        participant2: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        participant3: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
      },
    });

    return res.status(201).json({ data: tiebreakerMatch, message: "Partido de desempate creado" });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/matches/:matchId/tiebreaker-result { first, second, third } */
export const reportTiebreakerResult = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { first, second, third } = z.object({
      first:  z.string().min(1),
      second: z.string().min(1),
      third:  z.string().min(1),
    }).parse(req.body);

    // Validate all three are distinct
    if (new Set([first, second, third]).size !== 3) {
      return next(badRequest("Los tres participantes deben ser distintos"));
    }

    const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));
    if (!match.isTiebreaker || !match.participant3Id) {
      return next(badRequest("Este partido no es un desempate de 3 jugadores"));
    }

    // Validate the submitted IDs are exactly the match's own participants (any order)
    const validIds = new Set([match.participant1Id, match.participant2Id, match.participant3Id]);
    if (![first, second, third].every(id => validIds.has(id))) {
      return next(badRequest("Los participantes no corresponden a este partido"));
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const updated = await prisma.match.update({
      where: { id: req.params.matchId },
      data: {
        participant1Id: first,
        participant2Id: second,
        participant3Id: third,
        winnerId: first,
        status: "completed",
        playedAt: new Date(),
      },
      include: {
        participant1: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        participant2: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        participant3: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
      },
    });

    // Free the diana — same as reportResult does for regular matches
    await prisma.diana.updateMany({ where: { matchId: req.params.matchId }, data: { matchId: null } });

    return res.json({ data: updated, message: "Resultado de desempate registrado" });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/unapprove-group { group: "A", bracketLevel?: "Nivel 1" } — unlock */
export const unapproveGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { group, bracketLevel } = z.object({
      group:        z.string().min(1),
      bracketLevel: z.string().min(1).nullable().optional(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }

    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    await prisma.match.updateMany({
      where: { tournamentId: req.params.id, rrGroup: group, ...levelFilter },
      data: { reviewed: false },
    });

    return res.json({ data: null, message: `Grupo ${group} desbloqueado para edición` });
  } catch (err) { next(err); }
};

/** POST /tournaments/:id/reset-rr-group { group: "A", bracketLevel?: "Nivel 1" }
 *  Deletes all matches for the given RR group and regenerates them fresh. */
export const resetRRGroup = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { group, bracketLevel } = z.object({
      group:        z.string().min(1),
      bracketLevel: z.string().min(1).nullable().optional(),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (tournament.format !== "round_robin") {
      return next(badRequest("Solo torneos Round Robin tienen grupos"));
    }

    const levelFilter = bracketLevel !== undefined ? { bracketLevel: bracketLevel ?? null } : {};

    // Fetch participant IDs from existing matches (safe for multi-level where letters repeat)
    const existingMatches = await prisma.match.findMany({
      where: { tournamentId: req.params.id, rrGroup: group, ...levelFilter },
      select: { participant1Id: true, participant2Id: true },
    });
    const pIds = [...new Set([
      ...existingMatches.map(m => m.participant1Id),
      ...existingMatches.map(m => m.participant2Id),
    ].filter((id): id is string => id != null))];

    if (pIds.length < 2) {
      return next(badRequest(`El Grupo ${group} no tiene participantes suficientes`));
    }

    const groupParticipants = await prisma.participant.findMany({
      where: { id: { in: pIds } },
    });

    // Delete all existing matches for this group (scoped to level)
    await prisma.match.deleteMany({
      where: { tournamentId: req.params.id, rrGroup: group, ...levelFilter },
    });

    // Regenerate round-robin matches for this group (restoring bracketLevel)
    const koBracketLevel = bracketLevel !== undefined ? (bracketLevel ?? null) : null;
    const newMatches = generateRoundRobin(groupParticipants, group);
    await prisma.match.createMany({
      data: newMatches.map(m => ({ ...m, tournamentId: req.params.id, bracketLevel: koBracketLevel })),
    });

    return res.json({
      data: { group, matchCount: newMatches.length },
      message: `Grupo ${group} reiniciado (${newMatches.length} partidos regenerados)`,
    });
  } catch (err) { next(err); }
};

// ─── Upload tournament image ───────────────────────────────────────────────────
const UPLOADS_ROOT = path.resolve(__dirname, "../../../uploads");

function safeUnlink(imageUrl: string) {
  // Guard against path traversal: resolve and confirm path stays inside UPLOADS_ROOT
  const relative = imageUrl.replace(/^\/uploads\//, "");
  const resolved = path.resolve(UPLOADS_ROOT, relative);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep) && resolved !== UPLOADS_ROOT) return;
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}

export const uploadTournamentImage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Torneo"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return next(badRequest("No se ha proporcionado ninguna imagen"));

    // Delete old image from disk if it exists
    if (tournament.imageUrl) {
      safeUnlink(tournament.imageUrl);
    }

    const imageUrl = `/uploads/tournaments/${file.filename}`;
    const updated = await prisma.tournament.update({
      where: { id: req.params.id },
      data: { imageUrl },
    });

    return res.json({ data: { imageUrl: updated.imageUrl }, message: "Imagen actualizada" });
  } catch (err) { next(err); }
};

// ─── Player self-inscription ──────────────────────────────────────────────────

/** POST /tournaments/:id/player-inscribe — player self-inscription (pending approval) */
export const playerInscribe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== "player") return next(forbidden("Solo jugadores pueden auto-inscribirse"));

    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { participants: true } } },
    });
    if (!tournament) return next(badRequest("Torneo no encontrado"));
    if (!tournament.allowPlayerReg) return next(forbidden("Este torneo no acepta inscripciones de jugadores"));
    if (tournament.status !== "registration") return next(badRequest("Las inscripciones no están abiertas"));
    if (tournament.maxParticipants > 0 && tournament._count.participants >= tournament.maxParticipants) {
      return next(badRequest("El torneo está completo"));
    }

    const existing = await prisma.participant.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: req.user!.userId } },
    });
    if (existing) return next(badRequest("Ya estás inscrito en este torneo"));

    const participant = await prisma.participant.create({
      data: {
        tournamentId: tournament.id,
        entityType: tournament.participantType as any,
        userId: req.user!.userId,
        inscriptionStatus: "pending_web",
        paymentStatus: "pending",
      },
    });

    // Send inscription-pending email (non-blocking)
    const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";
    prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true, email: true } })
      .then(user => {
        if (!user) return;
        return sendInscriptionPending({
          to: user.email,
          name: user.name,
          tournamentName: tournament!.name,
          tournamentFormat: tournament!.format ?? undefined,
          tournamentDate: tournament!.startDate?.toISOString() ?? null,
          tournamentUrl: `${clientUrl}/torneos/${tournament!.id}`,
        });
      })
      .catch(err => console.error("[email] inscription pending:", err));

    return res.status(201).json({ data: participant, message: "Solicitud enviada. Pendiente de aprobación del organizador." });
  } catch (err) { next(err); }
};

/** GET /tournaments/:id/pending-inscriptions — get pending player inscriptions (organizer/admin) */
export const getPendingInscriptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());

    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { metric: true, gameType: true, createdById: true },
    });
    if (!tournament) return next(notFound("Tournament"));
    // Only the tournament's organizer (or an admin) can view its pending inscriptions
    if (req.user!.role !== "admin" && tournament.createdById !== req.user!.userId) {
      return next(forbidden());
    }

    const inscriptions = await prisma.participant.findMany({
      where: { tournamentId: req.params.id, inscriptionStatus: { in: ["pending", "pending_web"] } },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, province: true, dni: true } },
      },
      orderBy: { registeredAt: "asc" },
    });

    // Enrich each inscription with PlayerRecord metric data (lookup by DNI)
    const enriched = await Promise.all(inscriptions.map(async (insc) => {
      const dni = insc.user?.dni;
      if (!dni) return { ...insc, historicMetric: null };

      const record = await prisma.playerRecord.findFirst({
        where: { dni: { equals: dni, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { ppd: true, mpr: true, combined: true, gamesPlayed: true, level: true, season: true },
      });

      const metricField = tournament?.metric === "mpr" ? "mpr"
        : tournament?.metric === "combined" ? "combined"
        : "ppd";

      return {
        ...insc,
        historicMetric: record ? {
          value: record[metricField] ?? null,
          ppd: record.ppd,
          mpr: record.mpr,
          combined: record.combined,
          gamesPlayed: record.gamesPlayed,
          level: record.level,
          season: record.season,
          metricKey: metricField,
        } : null,
      };
    }));

    return res.json({ data: enriched });
  } catch (err) { next(err); }
};

/** PATCH /tournaments/:id/inscriptions/:participantId — approve or reject */
export const resolveInscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role === "player") return next(forbidden());

    // Verify ownership before approving/rejecting
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { createdById: true },
    });
    if (!tournament) return next(notFound("Tournament"));
    if (req.user!.role !== "admin" && tournament.createdById !== req.user!.userId) {
      return next(forbidden());
    }

    const { action, metricValue } = z.object({
      action:      z.enum(["approve", "reject"]),
      metricValue: z.number().nullable().optional(),
    }).parse(req.body);

    if (action === "reject") {
      await prisma.participant.delete({ where: { id: req.params.participantId } });
      return res.json({ message: "Inscripción rechazada y eliminada" });
    }

    const updated = await prisma.participant.update({
      where: { id: req.params.participantId },
      data: {
        inscriptionStatus: "confirmed",
        ...(metricValue != null ? { metricValue } : {}),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // Send inscription-approved email (non-blocking)
    if (updated.user) {
      const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";
      const tournamentId = req.params.id;
      prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { name: true, format: true, startDate: true },
      })
        .then(t => {
          if (!t) return;
          return sendInscriptionApproved({
            to: updated.user!.email,
            name: updated.user!.name,
            tournamentName: t.name,
            tournamentFormat: t.format ?? undefined,
            tournamentDate: t.startDate?.toISOString() ?? null,
            tournamentUrl: `${clientUrl}/torneos/${tournamentId}`,
          });
        })
        .catch(err => console.error("[email] inscription approved:", err));
    }

    return res.json({ data: updated, message: "Inscripción aprobada" });
  } catch (err) { next(err); }
};

// ─── Remove tournament image ───────────────────────────────────────────────────
export const removeTournamentImage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Torneo"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

    if (tournament.imageUrl) {
      safeUnlink(tournament.imageUrl);
    }

    await prisma.tournament.update({ where: { id: req.params.id }, data: { imageUrl: null } });
    return res.json({ message: "Imagen eliminada" });
  } catch (err) { next(err); }
};
