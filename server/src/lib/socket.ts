import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "./prisma";

// In-memory map of tournamentId → masterSocketId (the device connected to PA speakers)
const masterAnnouncers = new Map<string, string>();

export function getMasterAnnouncerSocketId(tournamentId: string): string | undefined {
  return masterAnnouncers.get(tournamentId);
}

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true },
  });

  // Auth middleware for socket — always reads role from DB, never trusts the JWT payload.
  // This ensures a role change takes effect immediately on new socket connections
  // rather than waiting for the current access token to expire.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = verifyAccessToken(token);

      // Fetch fresh role from DB — payload.role may be stale if it was changed after token issuance
      const freshUser = await prisma.user.findUnique({
        where:  { id: payload.userId },
        select: { id: true, role: true },
      });
      if (!freshUser) return next(new Error("User not found"));

      (socket as any).user = { userId: freshUser.id, role: freshUser.role };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Join tournament room — verify tournament exists and is accessible
    socket.on("join:tournament", async (tournamentId: string) => {
      try {
        if (typeof tournamentId !== "string" || !tournamentId) return;
        const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { isPublic: true } });
        if (!tournament) return;
        const user = (socket as any).user;
        const isPrivileged = user?.role === "organizer" || user?.role === "admin";
        if (!isPrivileged && tournament.isPublic === false) return;
        socket.join(`tournament:${tournamentId}`);
      } catch {
        // silently ignore
      }
    });

    socket.on("leave:tournament", (tournamentId: string) => {
      if (typeof tournamentId === "string" && tournamentId) {
        socket.leave(`tournament:${tournamentId}`);
      }
    });

    // ── Master announcer (PA speaker) ─────────────────────────────────────────
    socket.on("announcer:register", (tournamentId: string) => {
      if (typeof tournamentId !== "string" || !tournamentId) return;
      const user = (socket as any).user;
      if (user?.role !== "organizer" && user?.role !== "admin") return;
      masterAnnouncers.set(tournamentId, socket.id);
      socket.emit("announcer:status", { active: true, tournamentId });
    });

    socket.on("announcer:unregister", (tournamentId: string) => {
      if (masterAnnouncers.get(tournamentId) === socket.id) {
        masterAnnouncers.delete(tournamentId);
        socket.emit("announcer:status", { active: false, tournamentId });
      }
    });

    socket.on("disconnect", () => {
      // Clean up master announcer if this socket was the master
      for (const [tid, sid] of masterAnnouncers.entries()) {
        if (sid === socket.id) masterAnnouncers.delete(tid);
      }
    });
  });

  return io;
}
