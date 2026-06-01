import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound } from "../utils/errors";

export const getRankings = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await prisma.playerStats.findMany({
      orderBy: { user: { elo: "desc" } },
      take: 100,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
      },
    });

    const data = stats.map((s: typeof stats[number], i: number) => ({
      rank: i + 1,
      userId: s.userId,
      user: s.user,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      tournamentsPlayed: s.tournamentsPlayed,
      tournamentsWon: s.tournamentsWon,
      winRate: s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : 0,
    }));

    return res.json({ data });
  } catch (err) {
    next(err);
  }
};

export const getPlayerStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return next(notFound("User"));

    const stats = await prisma.playerStats.findUnique({
      where: { userId: req.params.userId },
      include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } } },
    });

    const recentMatches = await prisma.match.findMany({
      where: {
        status: "completed",
        OR: [{ participant1: { userId: req.params.userId } }, { participant2: { userId: req.params.userId } }],
      },
      orderBy: { playedAt: "desc" },
      take: 10,
      include: {
        tournament: { select: { id: true, name: true, format: true } },
        participant1: { include: { user: { select: { id: true, name: true } } } },
        participant2: { include: { user: { select: { id: true, name: true } } } },
        winner: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return res.json({
      data: {
        ...stats,
        winRate: stats && stats.wins + stats.losses > 0
          ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
          : 0,
        recentMatches,
      },
    });
  } catch (err) {
    next(err);
  }
};
