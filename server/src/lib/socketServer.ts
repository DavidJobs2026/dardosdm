import { Server as SocketServer } from "socket.io";
import { getMasterAnnouncerSocketId } from "./socket";

let _io: SocketServer | null = null;

export function setIo(io: SocketServer) {
  _io = io;
}

export function getIo(): SocketServer | null {
  return _io;
}

/** Broadcast a match update to everyone watching the tournament room */
export function emitMatchUpdated(tournamentId: string, match: object) {
  _io?.to(`tournament:${tournamentId}`).emit("match:updated", match);
}

/** Broadcast a tournament lifecycle change (start, finalize, etc.) */
export function emitTournamentUpdated(tournamentId: string, data: object) {
  _io?.to(`tournament:${tournamentId}`).emit("tournament:updated", { tournamentId, ...data });
}

export interface AnnouncementPayload {
  p1: string;
  p2?: string;
  p3?: string;
  diana: number;
  callNumber: number; // 1, 2, or 3
}

/** Emit announcement to the master announcer device (or broadcast to all if no master) */
export function emitAnnouncement(tournamentId: string, payload: AnnouncementPayload) {
  if (!_io) return;
  const masterId = getMasterAnnouncerSocketId(tournamentId);
  if (masterId) {
    _io.to(masterId).emit("announcer:speak", payload);
  } else {
    // If no master registered, broadcast to the tournament room so the requesting
    // device can play locally (each device decides if it should play)
    _io.to(`tournament:${tournamentId}`).emit("announcer:speak", payload);
  }
}
