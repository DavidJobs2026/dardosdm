import { Router } from "express";
import { Server as SocketServer } from "socket.io";
import {
  listTournaments, getTournament, createTournament,
  updateTournament, deleteTournament, startTournament, startLevel,
  finalizeTournament, openRegistration, resetTournament, resetLevel, recalculateMetrics,
  getRRStandings, approveGroup, unapproveGroup, launchKO, resetKO, createTiebreakerMatch, reportTiebreakerResult, resetRRGroup,
  playerInscribe, getPendingInscriptions, resolveInscription,
  setSocketServer,
  // image handled separately (multer middleware)
} from "../controllers/tournament.controller";
import {
  listParticipants, addParticipant, addGroupParticipant, blindPair,
  removeParticipant, randomizeSeeds, updateSeed, updatePayment, updateMetric,
} from "../controllers/participant.controller";
import { listMatches, getMatch, reportResult, repairBracket, resetMatchResult } from "../controllers/match.controller";
import { listDianas, setupDianas, saveLayout, assignDiana, unassignDiana, deleteDiana, bulkDeleteDianas, toggleBrokenDiana, launchMatch, noShowMatch } from "../controllers/diana.controller";
import { authenticate, requireRole } from "../middlewares/auth.middleware";
import { tournamentImageUpload } from "../middlewares/upload.middleware";
import { uploadTournamentImage, removeTournamentImage } from "../controllers/tournament.controller";

export default function tournamentRoutes(io: SocketServer): Router {
  const router = Router();
  setSocketServer(io); // allow tournament controller to emit lifecycle events

  // Tournaments
  router.get("/", listTournaments);
  router.get("/:id", getTournament);
  router.post("/", authenticate, requireRole("organizer", "admin"), createTournament);
  router.patch("/:id", authenticate, updateTournament);
  router.delete("/:id", authenticate, deleteTournament);
  router.post("/:id/open-registration", authenticate, openRegistration);
  router.post("/:id/start", authenticate, startTournament);
  router.post("/:id/start-level", authenticate, startLevel);
  router.post("/:id/finalize", authenticate, finalizeTournament);
  router.post("/:id/reset", authenticate, resetTournament);
  router.post("/:id/reset-level", authenticate, resetLevel);
  router.post("/:id/recalculate-metrics", authenticate, recalculateMetrics);

  // Player self-inscription
  router.post("/:id/player-inscribe",              authenticate, playerInscribe);
  router.get("/:id/pending-inscriptions",          authenticate, getPendingInscriptions);
  router.patch("/:id/inscriptions/:participantId", authenticate, resolveInscription);

  // Participants
  router.get("/:id/participants", authenticate, listParticipants);
  router.post("/:id/participants", authenticate, addParticipant);
  router.post("/:id/participants/group", authenticate, addGroupParticipant);
  router.post("/:id/blind-pair", authenticate, blindPair);
  router.delete("/:id/participants/:participantId", authenticate, removeParticipant);
  router.post("/:id/participants/randomize", authenticate, randomizeSeeds);
  router.patch("/:id/participants/:participantId/seed",    authenticate, updateSeed);
  router.patch("/:id/participants/:participantId/payment", authenticate, updatePayment);
  router.patch("/:id/participants/:participantId/metric",  authenticate, updateMetric);

  // Matches
  router.get("/:id/matches",           authenticate, listMatches);
  router.get("/:id/matches/:matchId",  authenticate, getMatch);
  router.post("/:id/matches/:matchId/result", authenticate, reportResult(io));
  router.post("/:id/matches/:matchId/reset-result", authenticate, resetMatchResult);
  router.post("/:id/repair-bracket", authenticate, repairBracket);

  // Dianas
  router.get("/:id/dianas", authenticate, listDianas);
  router.post("/:id/dianas/setup", authenticate, setupDianas);
  router.put("/:id/dianas/layout", authenticate, saveLayout);
  router.post("/:id/dianas/bulk-delete", authenticate, bulkDeleteDianas);
  router.delete("/:id/dianas/:dianaId", authenticate, deleteDiana);
  router.patch("/:id/dianas/:dianaId/broken", authenticate, toggleBrokenDiana);
  router.post("/:id/matches/:matchId/assign-diana", authenticate, assignDiana);
  router.delete("/:id/matches/:matchId/diana", authenticate, unassignDiana);
  router.post("/:id/matches/:matchId/launch", authenticate, launchMatch);
  router.post("/:id/matches/:matchId/no-show", authenticate, noShowMatch(io));

  // Round Robin
  router.get("/:id/rr-standings", authenticate, getRRStandings);
  router.post("/:id/approve-group", authenticate, approveGroup);
  router.post("/:id/unapprove-group", authenticate, unapproveGroup);
  router.post("/:id/launch-ko", authenticate, launchKO);
  router.post("/:id/reset-ko", authenticate, resetKO);
  router.post("/:id/create-tiebreaker", authenticate, createTiebreakerMatch);
  router.post("/:id/matches/:matchId/tiebreaker-result", authenticate, reportTiebreakerResult);
  router.post("/:id/reset-rr-group", authenticate, resetRRGroup);

  // Tournament image
  router.post("/:id/image", authenticate, (req, res, next) => {
    tournamentImageUpload(req, res, (err: unknown) => {
      if (err) return next(err);
      next();
    });
  }, uploadTournamentImage);
  router.delete("/:id/image", authenticate, removeTournamentImage);

  return router;
}
