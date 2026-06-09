import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { selectCoOrg } from "../utils/tournament-access";

/** Only the tournament OWNER (not a co-organizer) or admin can manage the co-organizer list */
function isOwner(tournament: { createdById: string }, req: AuthRequest): boolean {
  return req.user!.role === "admin" || tournament.createdById === req.user!.userId;
}

/** GET /tournaments/:id/co-organizers — list granted co-organizers */
export const listCoOrganizers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { coOrganizers: { select: selectCoOrg } },
    });
    if (!t) return next(notFound("Tournament"));
    // Only owner/admin or an existing co-organizer may list
    const viewable =
      isOwner(t, req) || t.coOrganizers.some(c => c.userId === req.user!.userId);
    if (!viewable) return next(forbidden());

    const records = await prisma.tournamentCoOrganizer.findMany({
      where: { tournamentId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { grantedAt: "asc" },
    });
    return res.json({ data: records });
  } catch (err) { next(err); }
};

const addSchema = z.object({ userId: z.string().min(1) });

/** POST /tournaments/:id/co-organizers — grant access to another organizer */
export const addCoOrganizer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return next(notFound("Tournament"));
    if (!isOwner(t, req)) return next(forbidden("Solo el propietario del torneo puede gestionar co-organizadores"));

    const { userId } = addSchema.parse(req.body);

    // Can't add yourself
    if (userId === t.createdById) return next(badRequest("El propietario ya tiene acceso completo"));

    // Target must be an organizer (or admin)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
    if (!user) return next(notFound("Usuario"));
    if (user.role !== "organizer" && user.role !== "admin") {
      return next(badRequest("Solo se puede añadir organizadores como co-organizadores"));
    }

    const record = await prisma.tournamentCoOrganizer.upsert({
      where: { tournamentId_userId: { tournamentId: req.params.id, userId } },
      create: { tournamentId: req.params.id, userId },
      update: {},
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return res.status(201).json({ data: record });
  } catch (err) { next(err); }
};

/** DELETE /tournaments/:id/co-organizers/:coOrgId — revoke access */
export const removeCoOrganizer = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!t) return next(notFound("Tournament"));
    if (!isOwner(t, req)) return next(forbidden("Solo el propietario puede revocar co-organizadores"));

    const record = await prisma.tournamentCoOrganizer.findUnique({ where: { id: req.params.coOrgId } });
    if (!record || record.tournamentId !== req.params.id) return next(notFound("Co-organizador"));

    await prisma.tournamentCoOrganizer.delete({ where: { id: req.params.coOrgId } });
    return res.json({ message: "Acceso revocado" });
  } catch (err) { next(err); }
};
