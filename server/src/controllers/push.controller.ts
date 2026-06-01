import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";

export const subscribePush = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { endpoint, keys } = z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }).parse(req.body);

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user!.userId },
      create: { userId: req.user!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return res.json({ message: "Suscripción guardada" });
  } catch (err) { next(err); }
};

export const unsubscribePush = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.userId } });
    return res.json({ message: "Suscripción eliminada" });
  } catch (err) { next(err); }
};
