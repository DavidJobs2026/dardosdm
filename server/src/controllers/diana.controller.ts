import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { Server as SocketServer } from "socket.io";
import { handleBracketAdvancement } from "./match.controller";

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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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

    res.json({ data: null, message: `Diana ${dianaNumber} asignada` });
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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

    const matchToUnassign = await prisma.match.findUnique({ where: { id: req.params.matchId } });
    if (!matchToUnassign || matchToUnassign.tournamentId !== req.params.id) return next(notFound("Match"));

    await prisma.diana.updateMany({ where: { matchId: req.params.matchId }, data: { matchId: null } });
    // Reset launch times too
    await prisma.match.update({
      where: { id: req.params.matchId },
      data: { launch1At: null, launch2At: null, launch3At: null, noShowAt: null, noShowReason: null },
    });

    res.json({ data: null, message: "Diana liberada" });
  } catch (err) { next(err); }
};

// ─── Delete a single diana ────────────────────────────────────────────────────
export const deleteDiana = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

    const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
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
            bracketLevel: match.bracketLevel,   // scope to same level only
            id: { not: match.id },
            status: { notIn: ["completed", "bye"] },
            launch1At: { not: null },
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
      return res.json({ data: { call: 1, at: now.toISOString() }, message: "Primera llamada registrada" });
    }

    if (!match.launch2At) {
      const elapsed = now.getTime() - new Date(match.launch1At).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la segunda llamada`));
      }
      await prisma.match.update({ where: { id: match.id }, data: { launch2At: now } });
      return res.json({ data: { call: 2, at: now.toISOString() }, message: "Segunda llamada registrada" });
    }

    if (!match.launch3At) {
      const elapsed = now.getTime() - new Date(match.launch2At).getTime();
      if (elapsed < LAUNCH_COOLDOWN_MS) {
        const rem = Math.ceil((LAUNCH_COOLDOWN_MS - elapsed) / 1000);
        return next(badRequest(`Espera ${rem}s más para la tercera llamada`));
      }
      await prisma.match.update({ where: { id: match.id }, data: { launch3At: now } });
      return res.json({ data: { call: 3, at: now.toISOString() }, message: "Tercera llamada registrada" });
    }

    return next(badRequest("Ya se realizaron las 3 llamadas para este partido"));
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

      const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
      if (!tournament) return next(notFound("Tournament"));
      if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") return next(forbidden());

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

      io.to(`tournament:${match.tournamentId}`).emit("match:updated", updated);

      return res.json({ data: { winnerId }, message: "No presentado registrado" });
    } catch (err) { next(err); }
  };
