import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { canManageTournament, selectCoOrg } from "../utils/tournament-access";
import { Server as SocketServer } from "socket.io";
import { handleBracketAdvancement } from "./match.controller";
import { sendPushToUser } from "../lib/push";
import { emitMatchUpdated, emitAnnouncement } from "../lib/socketServer";
import { audit } from "../lib/audit";

// Helper: fetch a match with the full include shape the client expects, then broadcast it
async function broadcastMatch(matchId: string) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      participant1: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
      participant2: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
      winner:       { include: { user: { select: { id: true, name: true, avatarUrl: true } }, team: { select: { id: true, name: true } } } },
      diana:        { select: { id: true, number: true } },
    },
  });
  if (m) emitMatchUpdated(m.tournamentId, m);
}

const LAUNCH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Shared include for diana → match → participants
const matchInclude = {
  match: {
    include: {
      participant1: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          team: { select: { id: true, name: true } },
        },
      },
      participant2: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          team: { select: { id: true, name: true } },
        },
      },
    },
  },
};

// ─── List dianas ──────────────────────────────────────────────────────────────
export const listDianas = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      select: { id: true, isPublic: true, createdById: true, coOrganizers: { select: selectCoOrg } },
    });
    if (!tournament) return next(notFound("Tournament"));

    // ── Authorization ─────────────────────────────────────────────────────────
    //  - managers (admin/owner/co-organizer) → allowed
    //  - registered referees of this tournament → allowed (they need their boards)
    //  - anyone else → only on PUBLIC tournaments
    if (!canManageTournament(tournament as any, req)) {
      const referee = req.user
        ? await prisma.tournamentReferee.findUnique({
            where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.user.userId } },
            select: { id: true },
          })
        : null;
      if (!referee && !tournament.isPublic) {
        return next(forbidden("No tienes acceso a las dianas de este torneo"));
      }
    }

    const dianas = await prisma.diana.findMany({
      where: { tournamentId: req.params.id },
      orderBy: { number: "asc" },
      include: matchInclude,
    });
    res.json({ data: dianas });
  } catch (err) { next(err); }
};

// ─── Setup dianas (create map with N dianas) ──────────────────────────────────
export const setupDianas = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { count } = z.object({ count: z.number().int().min(1).max(500) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    // Delete all unoccupied dianas (occupied ones stay to preserve match assignments)
    await prisma.diana.deleteMany({ where: { tournamentId: req.params.id, matchId: null } });

    // Find occupied diana numbers so we don't re-create them
    const occupied = await prisma.diana.findMany({
      where: { tournamentId: req.params.id },
      select: { number: true },
    });
    const occupiedNums = new Set(occupied.map(d => d.number));

    // Create missing dianas up to count
    const toCreate: { tournamentId: string; number: number }[] = [];
    for (let n = 1; n <= count; n++) {
      if (!occupiedNums.has(n)) toCreate.push({ tournamentId: req.params.id, number: n });
    }
    if (toCreate.length) await prisma.diana.createMany({ data: toCreate });

    res.json({ data: { count }, message: `Mapa de ${count} dianas creado` });
  } catch (err) { next(err); }
};

// ─── Assign diana to match ────────────────────────────────────────────────────
export const assignDiana = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dianaNumber } = z.object({ dianaNumber: z.number().int().min(1) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const diana = await prisma.diana.findUnique({
      where: { tournamentId_number: { tournamentId: req.params.id, number: dianaNumber } },
    });
    if (!diana) return next(notFound(`Diana ${dianaNumber}`));
    if (diana.matchId && diana.matchId !== req.params.matchId) {
      return next(badRequest(`La diana ${dianaNumber} ya está asignada a otro partido`));
    }

    const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));
    if (match.status === "completed" || match.status === "bye") {
      return next(badRequest("Este partido ya ha terminado"));
    }

    // Free any previous diana for this match
    await prisma.diana.updateMany({ where: { matchId: req.params.matchId }, data: { matchId: null } });
    // Assign new diana
    await prisma.diana.update({ where: { id: diana.id }, data: { matchId: req.params.matchId } });

    broadcastMatch(req.params.matchId).catch(() => {});
    res.json({ data: null, message: `Diana ${dianaNumber} asignada` });
  } catch (err) { next(err); }
};

// ─── Set RR group → diana reservations for one level ──────────────────────────
// Replaces the whole reservation map for the given level. Persisted server-side
// so referees (on other devices) see the boards and so they can be auto-freed.
export const setGroupDianas = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { level, assignments } = z.object({
      level:       z.string().nullable().optional(),
      assignments: z.record(z.array(z.number().int().min(1))),
    }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const lvl = level ?? null;

    await prisma.$transaction(async (tx) => {
      // Clear existing reservations for this level (only the ones actually reserved)
      await tx.diana.updateMany({
        where: { tournamentId: req.params.id, rrLevel: lvl, rrGroup: { not: null } },
        data:  { rrGroup: null, rrLevel: null },
      });
      // Apply the new reservations
      for (const [group, numbers] of Object.entries(assignments)) {
        if (!numbers.length) continue;
        await tx.diana.updateMany({
          where: { tournamentId: req.params.id, number: { in: numbers } },
          data:  { rrGroup: group, rrLevel: lvl },
        });
      }
    });

    return res.json({ data: null, message: "Reservas de grupo actualizadas" });
  } catch (err) { next(err); }
};

// ─── Save floor-plan layout ───────────────────────────────────────────────────
export const saveLayout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      dianas: z.array(z.object({
        id:   z.string(),
        posX: z.number().int().nullable(),
        posY: z.number().int().nullable(),
        room: z.string().max(100).nullable(),
      })),
    });
    const { dianas: updates } = schema.parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    await prisma.$transaction(
      updates.map(u =>
        prisma.diana.update({
          where: { id: u.id, tournamentId: req.params.id },
          data:  { posX: u.posX, posY: u.posY, room: u.room },
        })
      )
    );

    res.json({ data: null, message: "Plano guardado" });
  } catch (err) { next(err); }
};

// ─── Unassign diana from match ────────────────────────────────────────────────
export const unassignDiana = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const matchToUnassign = await prisma.match.findUnique({ where: { id: req.params.matchId } });
    if (!matchToUnassign || matchToUnassign.tournamentId !== req.params.id) return next(notFound("Match"));

    await prisma.diana.updateMany({ where: { matchId: req.params.matchId }, data: { matchId: null } });
    // Reset launch times too
    await prisma.match.update({
      where: { id: req.params.matchId },
      data: { launch1At: null, launch2At: null, launch3At: null, noShowAt: null, noShowReason: null },
    });

    broadcastMatch(req.params.matchId).catch(() => {});
    res.json({ data: null, message: "Diana liberada" });
  } catch (err) { next(err); }
};

// ─── Delete a single diana ────────────────────────────────────────────────────
export const deleteDiana = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const diana = await prisma.diana.findUnique({ where: { id: req.params.dianaId, tournamentId: req.params.id } });
    if (!diana) return next(notFound("Diana"));
    if (diana.matchId) return next(badRequest("No se puede eliminar una diana con partido activo"));

    await prisma.diana.delete({ where: { id: req.params.dianaId } });
    res.json({ data: null, message: `Diana ${diana.number} eliminada` });
  } catch (err) { next(err); }
};

// ─── Bulk-delete dianas (skips occupied ones) ─────────────────────────────────
export const bulkDeleteDianas = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    // Only delete dianas that belong to this tournament AND have no active match
    const result = await prisma.diana.deleteMany({
      where: {
        id:           { in: ids },
        tournamentId: req.params.id,
        matchId:      null,
      },
    });

    const skipped = ids.length - result.count;
    const msg = skipped > 0
      ? `${result.count} eliminadas, ${skipped} omitidas (en uso)`
      : `${result.count} diana${result.count !== 1 ? "s" : ""} eliminada${result.count !== 1 ? "s" : ""}`;

    res.json({ data: { deleted: result.count, skipped }, message: msg });
  } catch (err) { next(err); }
};

// ─── Toggle broken flag ────────────────────────────────────────────────────────
export const toggleBrokenDiana = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const diana = await prisma.diana.findUnique({ where: { id: req.params.dianaId, tournamentId: req.params.id } });
    if (!diana) return next(notFound("Diana"));
    if (diana.matchId && !diana.broken) return next(badRequest("No se puede averiar una diana con partido activo"));

    const updated = await prisma.diana.update({
      where: { id: req.params.dianaId },
      data:  { broken: !diana.broken },
    });
    const msg = updated.broken ? `Diana ${diana.number} marcada como averiada` : `Diana ${diana.number} marcada como reparada`;
    res.json({ data: updated, message: msg });
  } catch (err) { next(err); }
};

// ─── Launch match (1st / 2nd / 3rd call) ─────────────────────────────────────
export const launchMatch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));
    if (!canManageTournament(tournament, req)) return next(forbidden());

    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        participant1: { select: { userId: true, user: { select: { name: true } }, team: { select: { name: true } } } },
        participant2: { select: { userId: true, user: { select: { name: true } }, team: { select: { name: true } } } },
        diana: { select: { number: true } },
      },
    });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));
    if (match.status === "completed" || match.status === "bye") {
      return next(badRequest("Este partido ya ha terminado"));
    }

    const now = new Date();

    if (!match.launch1At) {
      // Block first call if either participant is already active in another launched match
      const ids = [match.participant1Id, match.participant2Id].filter(Boolean) as string[];
      if (ids.length > 0) {
        const busyMatch = await prisma.match.findFirst({
          where: {
            tournamentId: match.tournamentId,
            bracketLevel: match.bracketLevel,
            id: { not: match.id },
            status: { notIn: ["completed", "bye"] },
            launch1At: { not: null },
            // If all 3 calls were already made the player didn't show up —
            // don't block them from being called in their next match.
            launch3At: null,
            OR: ids.flatMap(id => [
              { participant1Id: id },
              { participant2Id: id },
            ]),
          },
        });
        if (busyMatch) {
          const busyIds = new Set([busyMatch.participant1Id, busyMatch.participant2Id].filter(Boolean));
          const busyId = ids.find(id => busyIds.has(id));
          const busyPart = busyId
            ? await prisma.participant.findUnique({
                where: { id: busyId },
                include: {
                  user: { select: { name: true } },
                  team: { select: { name: true } },
                },
              })
            : null;
          const name = busyPart?.user?.name ?? busyPart?.team?.name ?? "Un jugador";
          return next(badRequest(`${name} ya está siendo llamado en otro partido activo`));
        }
      }

      await prisma.match.update({ where: { id: match.id }, data: { launch1At: now } });
      sendPushNotification(match, tournament.name, 1);
      broadcastMatch(match.id).catch(() => {});
      // Emit TTS announcement to master announcer (or room fallback)
      if (match.diana?.number != null) {
        const p1 = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
        const p2 = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
        emitAnnouncement(match.tournamentId, { p1, p2, diana: match.diana.number, callNumber: 1 });
      }
      return res.json({ data: { call: 1, at: now.toISOString() }, message: "Primera llamada registrada" });
    }

    if (!match.launch2At) {
      const elapsed = now.getTime() - new Date(match.launch1At).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la segunda llamada`));
      }
      await prisma.match.update({ where: { id: match.id }, data: { launch2At: now } });
      sendPushNotification(match, tournament.name, 2);
      broadcastMatch(match.id).catch(() => {});
      if (match.diana?.number != null) {
        const p1 = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
        const p2 = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
        emitAnnouncement(match.tournamentId, { p1, p2, diana: match.diana.number, callNumber: 2 });
      }
      return res.json({ data: { call: 2, at: now.toISOString() }, message: "Segunda llamada registrada" });
    }

    if (!match.launch3At) {
      const elapsed = now.getTime() - new Date(match.launch2At).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la tercera llamada`));
      }
      await prisma.match.update({ where: { id: match.id }, data: { launch3At: now } });
      sendPushNotification(match, tournament.name, 3);
      broadcastMatch(match.id).catch(() => {});
      if (match.diana?.number != null) {
        const p1 = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
        const p2 = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
        emitAnnouncement(match.tournamentId, { p1, p2, diana: match.diana.number, callNumber: 3 });
      }
      return res.json({ data: { call: 3, at: now.toISOString() }, message: "Tercera llamada registrada" });
    }

    return next(badRequest("Ya se realizaron las 3 llamadas para este partido"));
  } catch (err) { next(err); }
};

// ─── Recall (árbitro o organizador re-emite una llamada al altavoz central) ───
export const recallMatch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { callNumber } = z.object({ callNumber: z.number().int().min(1).max(3) }).parse(req.body);

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
    if (!tournament) return next(notFound("Tournament"));

    const isOrganizer = canManageTournament(tournament, req);

    // Non-organizers must be a registered referee for this tournament
    let refereeRecord: { dianaStart: number | null; dianaEnd: number | null } | null = null;
    if (!isOrganizer) {
      refereeRecord = await prisma.tournamentReferee.findUnique({
        where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.user!.userId } },
        select: { dianaStart: true, dianaEnd: true },
      });
      if (!refereeRecord) return next(forbidden());
    }

    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        participant1: { select: { user: { select: { name: true } }, team: { select: { name: true } } } },
        participant2: { select: { user: { select: { name: true } }, team: { select: { name: true } } } },
        diana: { select: { number: true } },
      },
    });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));
    if (match.status === "completed" || match.status === "bye")
      return next(badRequest("Este partido ya ha terminado"));
    if (!match.launch1At)
      return next(badRequest("El partido no ha sido lanzado aún"));
    if (!match.diana?.number)
      return next(badRequest("El partido no tiene diana asignada"));

    // Verify the diana is within the referee's assigned range
    if (refereeRecord) {
      const { dianaStart, dianaEnd } = refereeRecord;
      const num = match.diana.number;
      const inRange =
        (dianaStart == null && dianaEnd == null) ||
        (dianaStart != null && dianaEnd != null && num >= dianaStart && num <= dianaEnd) ||
        (dianaStart != null && dianaEnd == null && num >= dianaStart) ||
        (dianaStart == null && dianaEnd != null && num <= dianaEnd);
      if (!inRange) return next(forbidden());
    }

    // ── Cooldown: same timing rules as launchMatch ──────────────────────────
    const now = new Date();
    if (callNumber === 2) {
      // 2ª llamada: requires at least LAUNCH_COOLDOWN_MS since the 1st call
      const elapsed = now.getTime() - new Date(match.launch1At!).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la segunda llamada`));
      }
    }
    if (callNumber === 3) {
      // 3ª llamada: requires launch2At to exist AND at least LAUNCH_COOLDOWN_MS since it
      if (!match.launch2At)
        return next(badRequest("Realiza la segunda llamada antes de la tercera"));
      const elapsed = now.getTime() - new Date(match.launch2At).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la tercera llamada`));
      }
    }

    // ── Record the timestamp if not already set by organizer ────────────────
    // This keeps Gestión in sync (countdown based on launch2At / launch3At)
    // and lets both panels share the same time reference.
    if (callNumber === 2 && !match.launch2At) {
      await prisma.match.update({ where: { id: match.id }, data: { launch2At: now } });
      broadcastMatch(match.id).catch(() => {});
    }
    if (callNumber === 3 && !match.launch3At) {
      await prisma.match.update({ where: { id: match.id }, data: { launch3At: now } });
      broadcastMatch(match.id).catch(() => {});
    }

    const p1 = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
    const p2 = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
    emitAnnouncement(match.tournamentId, { p1, p2, diana: match.diana.number, callNumber });

    // Audit the call
    const recallRole =
      tournament.createdById === req.user!.userId ||
      req.user!.role === "admin" ||
      req.user!.role === "organizer"
        ? "organizer"
        : "referee";
    audit({
      req,
      action:     "match.recall",
      entityType: "match",
      entityId:   match.id,
      entityName: `${p1} vs ${p2}`,
      details: {
        tournamentId: match.tournamentId,
        callNumber,
        diana:        match.diana.number,
        reporterName: req.user!.name ?? null,
        reporterRole: recallRole,
        p1Name:       p1,
        p2Name:       p2,
      },
    });

    return res.json({ data: { callNumber }, message: `Llamada ${callNumber} enviada al altavoz` });
  } catch (err) { next(err); }
};

// ─── No-show ──────────────────────────────────────────────────────────────────
export const noShowMatch = (io: SocketServer) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { noShowPlayerId, reason } = z.object({
        noShowPlayerId: z.string(),
        reason: z.string().max(500).optional(),
      }).parse(req.body);

      const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id }, include: { coOrganizers: { select: selectCoOrg } } });
      if (!tournament) return next(notFound("Tournament"));
      if (!canManageTournament(tournament, req)) return next(forbidden());

      const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
      if (!match) return next(notFound("Match"));
      if (match.tournamentId !== req.params.id) return next(notFound("Match"));
      if (match.status === "completed") return next(badRequest("Este partido ya ha terminado"));
      if (!match.launch1At) return next(badRequest("Realiza al menos una llamada antes de marcar no presentado"));

      const now = new Date();
      const lastCall = match.launch3At ?? match.launch2At ?? match.launch1At;
      const elapsed  = now.getTime() - new Date(lastCall).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más antes de marcar no presentado`));
      }

      if (noShowPlayerId !== match.participant1Id && noShowPlayerId !== match.participant2Id) {
        return next(badRequest("El jugador no pertenece a este partido"));
      }

      const winnerId = noShowPlayerId === match.participant1Id ? match.participant2Id : match.participant1Id;
      if (!winnerId) return next(badRequest("No se puede determinar el ganador"));

      // Mark no-show + complete
      const updated = await prisma.match.update({
        where: { id: match.id },
        data: { noShowAt: now, noShowReason: reason, winnerId, status: "completed", playedAt: now },
      });

      // Free the diana
      await prisma.diana.updateMany({ where: { matchId: match.id }, data: { matchId: null } });

      // Bracket advancement
      const loserId = noShowPlayerId;
      await handleBracketAdvancement(tournament.id, tournament.format, match, winnerId, loserId);

      // BUG-6 fix: use broadcastMatch() to emit the full match shape (with participant/diana
      // includes) instead of the bare prisma.match.update result which lacks relations.
      broadcastMatch(match.id).catch(() => {});

      return res.json({ data: { winnerId }, message: "No presentado registrado" });
    } catch (err) { next(err); }
  };

// ─── Push notification helper ─────────────────────────────────────────────────
// Sends a push to both participants of a match when they are called to a diana.
// Fire-and-forget: errors are caught inside sendPushToUser, never propagated.
function sendPushNotification(
  match: {
    diana: { number: number } | null;
    participant1: { userId: string | null; user: { name: string } | null; team: { name: string } | null } | null;
    participant2: { userId: string | null; user: { name: string } | null; team: { name: string } | null } | null;
  },
  tournamentName: string,
  callNumber: 1 | 2 | 3,
): void {
  const dianaNum = match.diana?.number ?? "?";
  const callLabel = callNumber === 1 ? "1ª llamada" : callNumber === 2 ? "2ª llamada" : "⚠️ ÚLTIMA llamada";
  const title = `🎯 ${callLabel} — Diana ${dianaNum}`;
  const body  = `${tournamentName}: dirígete a la diana ${dianaNum}`;

  const participants = [match.participant1, match.participant2];
  const userIds = participants
    .map(p => p?.userId)
    .filter((id): id is string => !!id);

  // Detailed logging so we can diagnose missing notifications in Railway logs
  console.log(`[push/diana] tournament="${tournamentName}" call=${callNumber} diana=${dianaNum}`);
  console.log(`[push/diana] p1: userId=${match.participant1?.userId ?? "NULL"} name=${match.participant1?.user?.name ?? match.participant1?.team?.name ?? "?"}`);
  console.log(`[push/diana] p2: userId=${match.participant2?.userId ?? "NULL"} name=${match.participant2?.user?.name ?? match.participant2?.team?.name ?? "?"}`);
  console.log(`[push/diana] sending to ${userIds.length} user(s): ${JSON.stringify(userIds)}`);

  if (userIds.length === 0) {
    console.warn("[push/diana] ⚠️ No userIds found — participants may be ghost accounts not linked to real users");
  }

  for (const userId of userIds) {
    sendPushToUser(userId, { title, body })
      .then(() => console.log(`[push/diana] ✅ dispatched for userId=${userId}`))
      .catch((e) => console.error(`[push/diana] ❌ failed for userId=${userId}:`, e?.message ?? e));
  }
}
