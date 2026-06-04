import { Router } from "express";
import { Server as SocketServer } from "socket.io";
import authRoutes from "./auth.routes";
import tournamentRoutes from "./tournament.routes";
import statsRoutes from "./stats.routes";
import teamRoutes from "./team.routes";
import userRoutes from "./user.routes";
import playerRecordRoutes from "./playerRecord.routes";
import pushRoutes from "./push.routes";
import backupRoutes from "./backup.routes";

export function createRouter(io: SocketServer): Router {
  const router = Router();

  router.use("/auth", authRoutes);
  router.use("/tournaments", tournamentRoutes(io));
  router.use("/stats", statsRoutes);
  router.use("/teams", teamRoutes);
  router.use("/users", userRoutes);
  router.use("/player-records", playerRecordRoutes);
  router.use("/push", pushRoutes);
  router.use("/backup", backupRoutes);

  return router;
}
