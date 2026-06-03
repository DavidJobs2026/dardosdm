import { Server as SocketServer } from "socket.io";

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
