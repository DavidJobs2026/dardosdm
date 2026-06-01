import { Router, IRouter, Response, NextFunction } from "express";
import { authenticate, AuthRequest } from "../middlewares/auth.middleware";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import { notFound, forbidden, badRequest } from "../utils/errors";

const router: IRouter = Router();

const createSchema = z.object({
  name: z.string().min(2),
  logoUrl: z.string().url().optional(),
});

router.get("/", async (_req, res, next) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: teams });
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } } } } },
    });
    if (!team) return next(notFound("Team"));
    res.json({ data: team });
  } catch (err) { next(err); }
});

router.post("/", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, logoUrl } = createSchema.parse(req.body);
    const team = await prisma.team.create({
      data: {
        name, logoUrl, createdById: req.user!.userId,
        members: { create: { userId: req.user!.userId, role: "captain" } },
      },
      include: { members: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } } } } },
    });
    res.status(201).json({ data: team });
  } catch (err) { next(err); }
});

router.post("/:id/members", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: { members: true } });
    if (!team) return next(notFound("Team"));

    const captain = team.members.find((m: { userId: string; role: string }) => m.userId === req.user!.userId && m.role === "captain");
    if (!captain && req.user!.role !== "admin") return next(forbidden("Only the captain can add members"));

    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return next(notFound("User"));

    const existing = team.members.find((m: { userId: string }) => m.userId === userId);
    if (existing) return next(badRequest("User is already a member"));

    const member = await prisma.teamMember.create({
      data: { teamId: team.id, userId },
      include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } } },
    });
    res.status(201).json({ data: member });
  } catch (err) { next(err); }
});

router.delete("/:id/members/:userId", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id }, include: { members: true } });
    if (!team) return next(notFound("Team"));

    const captain = team.members.find((m: { userId: string; role: string }) => m.userId === req.user!.userId && m.role === "captain");
    const isSelf = req.user!.userId === req.params.userId;

    if (!captain && !isSelf && req.user!.role !== "admin") return next(forbidden());

    await prisma.teamMember.deleteMany({ where: { teamId: team.id, userId: req.params.userId } });
    res.json({ data: null, message: "Member removed" });
  } catch (err) { next(err); }
});

export default router;
