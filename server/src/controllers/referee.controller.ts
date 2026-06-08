import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";

const isOrganizer = (tournament: { createdById: string }, req: AuthRequest) =>
  tournament.createdById === req.user!.userId || req.user!.role === "admin";

/** GET /tournaments/:id/referees — list referees (organizer/admin) */
export const listReferees = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { createdById: true } });
    if (!t) return next(notFound("Tournament"));
    if (!isOrganizer(t, req)) return next(forbidden());

    const referees = await prisma.tournamentReferee.findMany({
      where: { tournamentId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return res.json({ data: referees });
  } catch (err) { next(err); }
};

/** GET /tournaments/:id/my-referee — get current user's referee assignment */
export const getMyReferee = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ref = await prisma.tournamentReferee.findUnique({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId: req.user!.userId } },
    });
    return res.json({ data: ref ?? null });
  } catch (err) { next(err); }
};

const addSchema = z.object({
  userId:     z.string(),
  dianaStart: z.number().int().positive().optional().nullable(),
  dianaEnd:   z.number().int().positive().optional().nullable(),
});

/** POST /tournaments/:id/referees — add a referee */
export const addReferee = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { createdById: true } });
    if (!t) return next(notFound("Tournament"));
    if (!isOrganizer(t, req)) return next(forbidden());

    const { userId, dianaStart, dianaEnd } = addSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) return next(notFound("User"));

    // Validate range
    if (dianaStart != null && dianaEnd != null && dianaEnd < dianaStart) {
      return next(badRequest("El rango de dianas es inválido"));
    }

    const ref = await prisma.tournamentReferee.upsert({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId } },
      create: { tournamentId: req.params.id, userId, dianaStart: dianaStart ?? null, dianaEnd: dianaEnd ?? null },
      update: { dianaStart: dianaStart ?? null, dianaEnd: dianaEnd ?? null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return res.status(201).json({ data: ref });
  } catch (err) { next(err); }
};

/** DELETE /tournaments/:id/referees/:refereeId — remove a referee */
export const removeReferee = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id }, select: { createdById: true } });
    if (!t) return next(notFound("Tournament"));
    if (!isOrganizer(t, req)) return next(forbidden());

    await prisma.tournamentReferee.delete({ where: { id: req.params.refereeId } });
    return res.json({ message: "Árbitro eliminado" });
  } catch (err) { next(err); }
};
