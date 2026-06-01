import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { notFound, forbidden, badRequest } from "../utils/errors";
import { Server as SocketServer } from "socket.io";

const scoreSchema = z.object({
  score1: z.number().int().min(0),
  score2: z.number().int().min(0),
});

const winnerOnlySchema = z.object({
  winnerId: z.string(),
});

export const listMatches = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { round, bracketSide } = req.query;
    const validSides = ["winners", "losers"] as const;
    const roundNum   = round ? Number(round) : undefined;

    const where = {
      tournamentId: req.params.id,
      ...(roundNum !== undefined && !isNaN(roundNum) ? { round: roundNum } : {}),
      ...(bracketSide && validSides.includes(bracketSide as any) ? { bracketSide: bracketSide as string } : {}),
    };

    const matches = await prisma.match.findMany({
      where,
      orderBy: [{ round: "asc" }, { position: "asc" }],
      include: {
        participant1: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
            team: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        participant2: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, elo: true } },
            team: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        winner: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
            team: { select: { id: true, name: true } },
          },
        },
        diana: { select: { id: true, number: true } },
      },
    });

    return res.json({ data: matches });
  } catch (err) {
    next(err);
  }
};

export const getMatch = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: {
        participant1: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        participant2: { include: { user: { select: { id: true, name: true, avatarUrl: true, elo: true } }, team: { select: { id: true, name: true, logoUrl: true } } } },
        winner: { include: { user: { select: { id: true, name: true, avatarUrl: true } }, team: { select: { id: true, name: true } } } },
      },
    });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));
    return res.json({ data: match });
  } catch (err) {
    next(err);
  }
};

export const reportResult = (io: SocketServer) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.matchId },
      include: { tournament: { include: { levels: true } } },
    });
    if (!match) return next(notFound("Match"));
    if (match.status === "bye") {
      return next(badRequest("This match is already completed"));
    }
    // Allow re-reporting completed matches in two cases:
    //  • RR match with group not yet reviewed (organizer correcting a mistake)
    //  • KO match (rrGroup = null) — undo previous advancement first
    if (match.status === "completed") {
      if (match.rrGroup && !match.reviewed) {
        // RR match, group unlocked → fall through and overwrite
      } else if (!match.rrGroup) {
        // KO match — clear old winner from next-round slot before re-reporting
        await undoSEAdvancement(
          match.tournamentId, match.round, match.position, match.winnerId, match.bracketLevel ?? null
        );
        // fall through and overwrite
      } else {
        return next(badRequest("This match is already completed"));
      }
    }

    const tournament = match.tournament;
    const isOrganizer =
      tournament.createdById === req.user!.userId || req.user!.role === "admin";
    if (!isOrganizer) return next(forbidden("Only the organizer can report results"));

    // Determine effective bestOf for this match (level override > global)
    const levelConfig = (tournament.levels as Array<{ name: string; bestOf: number | null }>)
      .find(l => l.name === match.bracketLevel);
    const effectiveBestOf = levelConfig?.bestOf ?? tournament.bestOf ?? 3;
    const winsNeeded      = Math.ceil(effectiveBestOf / 2);

    let score1: number | null;
    let score2: number | null;
    let winnerId: string | null;
    let loserId:  string | null;

    if ((tournament as any).winnerOnly) {
      // Winner-only mode: accept { winnerId } without score validation
      const body = winnerOnlySchema.parse(req.body);
      if (body.winnerId !== match.participant1Id && body.winnerId !== match.participant2Id) {
        return next(badRequest("El ganador debe ser uno de los participantes del partido"));
      }
      winnerId = body.winnerId;
      loserId  = winnerId === match.participant1Id ? match.participant2Id : match.participant1Id;
      score1   = null;
      score2   = null;
    } else {
      // Score-based mode: validate bestOf constraint
      const body = scoreSchema.parse(req.body);
      score1 = body.score1;
      score2 = body.score2;

      if (score1 === score2) {
        return next(badRequest("No puede haber empate"));
      }
      const maxScore = Math.max(score1, score2);
      if (maxScore !== winsNeeded) {
        return next(badRequest(
          `El ganador debe tener exactamente ${winsNeeded} legs ganados (Mejor de ${effectiveBestOf})`
        ));
      }

      winnerId = score1 > score2 ? match.participant1Id : match.participant2Id;
      loserId  = score1 > score2 ? match.participant2Id : match.participant1Id;
    }

    const updatedMatch = await prisma.match.update({
      where: { id: match.id },
      data: { score1, score2, winnerId, status: "completed", playedAt: new Date() },
    });

    // Advance winner (and drop loser) to next match.
    // round_robin KO-phase matches (rrGroup = null) use SE advancement logic.
    const effectiveFormat =
      tournament.format === "round_robin" && !match.rrGroup
        ? "single_elimination"
        : tournament.format;

    if (effectiveFormat === "single_elimination") {
      await advanceSingleElim(
        match.tournamentId, match.round, match.position, winnerId!, match.bracketLevel ?? null
      );
    } else if (effectiveFormat === "double_elimination") {
      if (match.bracketSide === "losers") {
        // LB match: advance winner through LB rounds (or into GF)
        await advanceLBWinner(
          match.tournamentId, match.round, match.position, winnerId!, match.bracketLevel ?? null
        );
      } else if (match.round === 99) {
        // Grand Final: activate or void the bracket-reset match
        await handleGFResult(
          match.tournamentId, match.bracketLevel ?? null, winnerId!, match.participant1Id
        );
      } else if (match.round === 100) {
        // Bracket reset: tournament ends — no further advancement needed
      } else {
        // Regular WB match: advance winner through WB, drop loser to LB
        await advanceSingleElim(
          match.tournamentId, match.round, match.position, winnerId!, match.bracketLevel ?? null
        );
        if (loserId) {
          await dropToLosers(
            match.tournamentId, match.round, match.position, loserId, match.bracketLevel ?? null
          );
          // If this is WB R1, some LB R1 slots may be permanently empty because
          // the paired WB R1 match was a BYE — auto-advance those singletons
          if (match.round === 1) {
            await autoResolveLBSingletons(match.tournamentId, match.bracketLevel ?? null);
          }
        }
      }
    }

    // Update ELO
    if (winnerId && loserId) {
      await updateElo(match.tournamentId, winnerId, loserId);
    }

    // Free diana when match completes
    await prisma.diana.updateMany({ where: { matchId: match.id }, data: { matchId: null } });

    // Emit real-time update
    io.to(`tournament:${match.tournamentId}`).emit("match:updated", updatedMatch);

    return res.json({ data: updatedMatch, message: "Result reported" });
  } catch (err) {
    next(err);
  }
};

// ─── ELO Calculation ─────────────────────────────────────────────────────────

async function updateElo(tournamentId: string, winnerId: string, loserId: string) {
  const [winnerParticipant, loserParticipant] = await Promise.all([
    prisma.participant.findUnique({ where: { id: winnerId }, include: { user: true } }),
    prisma.participant.findUnique({ where: { id: loserId }, include: { user: true } }),
  ]);

  if (!winnerParticipant?.user || !loserParticipant?.user) return;

  const K = 32;
  const rW = winnerParticipant.user.elo;
  const rL = loserParticipant.user.elo;

  const expectedW = 1 / (1 + Math.pow(10, (rL - rW) / 400));
  const eloChange = Math.round(K * (1 - expectedW));

  await Promise.all([
    prisma.user.update({ where: { id: winnerParticipant.user.id }, data: { elo: { increment: eloChange } } }),
    prisma.user.update({ where: { id: loserParticipant.user.id }, data: { elo: { decrement: eloChange } } }),
    prisma.playerStats.upsert({
      where: { userId: winnerParticipant.user.id },
      create: { userId: winnerParticipant.user.id, wins: 1 },
      update: { wins: { increment: 1 } },
    }),
    prisma.playerStats.upsert({
      where: { userId: loserParticipant.user.id },
      create: { userId: loserParticipant.user.id, losses: 1 },
      update: { losses: { increment: 1 } },
    }),
  ]);
}

// ─── Bracket Advancement ─────────────────────────────────────────────────────

/**
 * Undo a previously applied SE advancement — clears the old winner from the
 * next-round slot.  Only touches the immediate next match; if that match was
 * already completed we leave it alone (can't cascade blindly).
 */
async function undoSEAdvancement(
  tournamentId: string,
  currentRound: number,
  currentPosition: number,
  oldWinnerId: string | null,
  bracketLevel: string | null
) {
  if (!oldWinnerId) return;
  const nextRound    = currentRound + 1;
  const nextPosition = Math.floor(currentPosition / 2);
  const isFirstSlot  = currentPosition % 2 === 0;

  // Primary: find the next WB match
  const nextMatch = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: nextRound, position: nextPosition, bracketSide: "winners" },
  });

  if (nextMatch && nextMatch.status !== "completed") {
    await prisma.match.update({
      where: { id: nextMatch.id },
      data: {
        ...(isFirstSlot ? { participant1Id: null } : { participant2Id: null }),
        // If both slots would now be empty, keep it pending
        status: "pending",
      },
    });
    return;
  }

  // Fallback: Grand Final (participant1 is always WB Final winner)
  const gf = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: 99, bracketSide: "winners" },
  });
  if (gf && gf.status !== "completed") {
    const clearSlot = gf.participant1Id === oldWinnerId ? { participant1Id: null } : { participant2Id: null };
    await prisma.match.update({ where: { id: gf.id }, data: { ...clearSlot, status: "pending" } });
  }
}

async function advanceSingleElim(
  tournamentId: string,
  currentRound: number,
  currentPosition: number,
  winnerId: string,
  bracketLevel: string | null
) {
  const nextRound    = currentRound + 1;
  const nextPosition = Math.floor(currentPosition / 2);
  const isFirstSlot  = currentPosition % 2 === 0;

  const nextMatch = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: nextRound, position: nextPosition, bracketSide: "winners" },
  });

  if (nextMatch) {
    await prisma.match.update({
      where: { id: nextMatch.id },
      data: isFirstSlot ? { participant1Id: winnerId } : { participant2Id: winnerId },
    });
    return;
  }

  // Fallback: look for Grand Final (round 99) — WB Final winner in double elimination
  const gf = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: 99, bracketSide: "winners" },
  });
  if (gf) {
    // WB Final winner always enters GF as participant1
    await prisma.match.update({ where: { id: gf.id }, data: { participant1Id: winnerId } });
  }
}

/** Drop a WB loser into the correct LB round/slot (double elimination only). */
async function dropToLosers(
  tournamentId: string,
  wbRound: number,
  wbPosition: number,
  loserId: string,
  bracketLevel: string | null
) {
  let lbRound: number;
  let lbPosition: number;
  let isSlot1: boolean;

  if (wbRound === 1) {
    // WB R1 losers pair up in LB R1 (consolidation)
    lbRound    = 1;
    lbPosition = Math.floor(wbPosition / 2);
    isSlot1    = wbPosition % 2 === 0;
  } else {
    // WB Rk (k≥2) losers drop into LB R(2k-2) as the WB drop-in (slot 2)
    lbRound    = 2 * (wbRound - 1);
    lbPosition = wbPosition;
    isSlot1    = false;
  }

  const lbMatch = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: lbRound, position: lbPosition, bracketSide: "losers" },
  });
  if (!lbMatch) return;

  await prisma.match.update({
    where: { id: lbMatch.id },
    data: isSlot1 ? { participant1Id: loserId } : { participant2Id: loserId },
  });
}

/** Advance an LB winner through LB rounds, or into the Grand Final as participant2. */
async function advanceLBWinner(
  tournamentId: string,
  currentRound: number,
  currentPosition: number,
  winnerId: string,
  bracketLevel: string | null
) {
  // Determine how many LB rounds exist (LB Final = last round)
  const agg = await prisma.match.aggregate({
    where: { tournamentId, bracketLevel, bracketSide: "losers" },
    _max: { round: true },
  });
  const totalLBRounds = agg._max.round ?? 0;

  if (currentRound === totalLBRounds) {
    // LB Final → Grand Final (round 99), participant2 (LB finalist)
    const gf = await prisma.match.findFirst({
      where: { tournamentId, bracketLevel, round: 99, bracketSide: "winners" },
    });
    if (!gf) return;
    await prisma.match.update({ where: { id: gf.id }, data: { participant2Id: winnerId } });
    return;
  }

  const nextRound  = currentRound + 1;
  const isOddRound = currentRound % 2 === 1; // odd = consolidation, even = merge

  let nextPosition: number;
  let isSlot1: boolean;

  if (isOddRound) {
    // consolidation → merge: winner is LB survivor (slot 1), same position
    nextPosition = currentPosition;
    isSlot1      = true;
  } else {
    // merge → consolidation: position halves, slot based on parity
    nextPosition = Math.floor(currentPosition / 2);
    isSlot1      = currentPosition % 2 === 0;
  }

  const nextMatch = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: nextRound, position: nextPosition, bracketSide: "losers" },
  });
  if (!nextMatch) return;

  await prisma.match.update({
    where: { id: nextMatch.id },
    data: isSlot1 ? { participant1Id: winnerId } : { participant2Id: winnerId },
  });
}

/**
 * Handle the Grand Final result in double elimination.
 * — WB finalist wins: void the bracket-reset match (mark as bye).
 * — LB finalist wins: activate the bracket-reset match with the same two players.
 */
async function handleGFResult(
  tournamentId: string,
  bracketLevel: string | null,
  winnerId: string,
  participant1Id: string | null  // GF slot 1 = WB finalist
) {
  const resetMatch = await prisma.match.findFirst({
    where: { tournamentId, bracketLevel, round: 100, bracketSide: "winners" },
  });
  if (!resetMatch) return;

  const wbFinalistWon = !!participant1Id && winnerId === participant1Id;

  if (wbFinalistWon) {
    // WB finalist wins GF → no bracket reset needed
    await prisma.match.update({
      where: { id: resetMatch.id },
      data: { status: "bye", winnerId },
    });
  } else {
    // LB finalist wins GF → activate bracket reset with the same two players
    const gf = await prisma.match.findFirst({
      where: { tournamentId, bracketLevel, round: 99, bracketSide: "winners" },
    });
    if (!gf) return;
    await prisma.match.update({
      where: { id: resetMatch.id },
      data: { participant1Id: gf.participant1Id, participant2Id: gf.participant2Id },
    });
  }
}

/**
 * Detect LB R1 matches that will only ever have one player because the paired
 * WB R1 match was a BYE (producing no loser). Auto-advance the lone participant.
 */
async function autoResolveLBSingletons(tournamentId: string, bracketLevel: string | null) {
  const singletons = await prisma.match.findMany({
    where: {
      tournamentId,
      bracketLevel,
      bracketSide: "losers",
      round: 1,
      status: "pending",
      OR: [
        { participant1Id: { not: null }, participant2Id: null },
        { participant1Id: null, participant2Id: { not: null } },
      ],
    },
  });

  for (const lbMatch of singletons) {
    const lbPos       = lbMatch.position;
    const emptySlot1  = !lbMatch.participant1Id;
    // slot1 comes from WB R1 pos (2*lbPos), slot2 from WB R1 pos (2*lbPos+1)
    const wbPosForEmpty = emptySlot1 ? 2 * lbPos : 2 * lbPos + 1;

    const wbMatch = await prisma.match.findFirst({
      where: { tournamentId, bracketLevel, round: 1, position: wbPosForEmpty, bracketSide: "winners" },
    });
    // Only auto-advance when the partner WB match is a confirmed BYE
    if (!wbMatch || wbMatch.status !== "bye") continue;

    const realPlayerId = (lbMatch.participant1Id ?? lbMatch.participant2Id)!;
    await prisma.match.update({
      where: { id: lbMatch.id },
      data: { status: "bye", winnerId: realPlayerId },
    });
    await advanceLBWinner(tournamentId, 1, lbPos, realPlayerId, bracketLevel);
  }
}

// ─── Repair Bracket ───────────────────────────────────────────────────────────
// Retroactively replay all completed match results so that next-round slots
// are correctly filled. Safe to run multiple times.

async function repairLevel(
  tournamentId: string,
  format: string,
  bracketLevel: string | null,
  koOnly = false   // when true, only process matches with rrGroup = null
) {
  const all = await prisma.match.findMany({
    where: {
      tournamentId,
      bracketLevel,
      status: "completed",
      ...(koOnly ? { rrGroup: null } : {}),
    },
    orderBy: [{ round: "asc" }, { position: "asc" }],
  });

  const wbDone = all.filter(m => m.bracketSide !== "losers");
  const lbDone = all.filter(m => m.bracketSide === "losers");

  if (format === "single_elimination") {
    for (const m of wbDone) {
      if (m.winnerId) await advanceSingleElim(tournamentId, m.round, m.position, m.winnerId, bracketLevel);
    }
  } else if (format === "double_elimination") {
    // Step 1: replay WB results (advance winner + drop loser)
    for (const m of wbDone) {
      if (!m.winnerId) continue;
      if (m.round === 99) {
        await handleGFResult(tournamentId, bracketLevel, m.winnerId, m.participant1Id);
      } else if (m.round !== 100) {
        await advanceSingleElim(tournamentId, m.round, m.position, m.winnerId, bracketLevel);
        const loserId = m.winnerId === m.participant1Id ? m.participant2Id : m.participant1Id;
        if (loserId) await dropToLosers(tournamentId, m.round, m.position, loserId, bracketLevel);
      }
    }
    // Step 2: resolve any LB R1 singletons caused by WB R1 BYEs
    await autoResolveLBSingletons(tournamentId, bracketLevel);
    // Step 3: replay LB results
    for (const m of lbDone) {
      if (m.winnerId) await advanceLBWinner(tournamentId, m.round, m.position, m.winnerId, bracketLevel);
    }
  }
}

// ─── Shared advancement helper (used by diana no-show logic) ─────────────────

export async function handleBracketAdvancement(
  tournamentId: string,
  format: string,
  match: { id: string; round: number; position: number; bracketSide: string | null; bracketLevel: string | null; participant1Id: string | null },
  winnerId: string,
  loserId: string | null
) {
  if (format === "single_elimination") {
    await advanceSingleElim(tournamentId, match.round, match.position, winnerId, match.bracketLevel ?? null);
  } else if (format === "double_elimination") {
    if (match.bracketSide === "losers") {
      await advanceLBWinner(tournamentId, match.round, match.position, winnerId, match.bracketLevel ?? null);
    } else if (match.round === 99) {
      await handleGFResult(tournamentId, match.bracketLevel ?? null, winnerId, match.participant1Id);
    } else if (match.round !== 100) {
      await advanceSingleElim(tournamentId, match.round, match.position, winnerId, match.bracketLevel ?? null);
      if (loserId) {
        await dropToLosers(tournamentId, match.round, match.position, loserId, match.bracketLevel ?? null);
        if (match.round === 1) await autoResolveLBSingletons(tournamentId, match.bracketLevel ?? null);
      }
    }
  }
}

export const repairBracket = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden("Only the organizer can repair the bracket"));
    }

    // Get every distinct bracketLevel present in this tournament's matches
    const rows = await prisma.match.findMany({
      where: { tournamentId: req.params.id },
      distinct: ["bracketLevel"],
      select: { bracketLevel: true },
    });
    const bracketLevels = rows.map(r => r.bracketLevel);

    for (const bl of bracketLevels) {
      // For round_robin tournaments the KO matches (bracketLevel = null, rrGroup = null)
      // are plain SE matches — repair them with SE logic.
      // RR group matches have no bracket advancement, so skip them.
      if (tournament.format === "round_robin") {
        // Count how many non-rr matches exist at this level
        const koCount = await prisma.match.count({
          where: { tournamentId: req.params.id, bracketLevel: bl, rrGroup: null },
        });
        if (koCount > 0) {
          await repairLevel(req.params.id, "single_elimination", bl, true);
        }
        // RR group matches (rrGroup set) don't need bracket repair
      } else {
        await repairLevel(req.params.id, tournament.format, bl);
      }
    }

    return res.json({ data: null, message: "Bracket repaired — all results re-propagated" });
  } catch (err) {
    next(err);
  }
};


/** POST /tournaments/:id/matches/:matchId/reset-result
 *  Clears score, winner and sets status back to pending so the result
 *  can be re-entered (e.g. to correct a data-entry mistake). */
export const resetMatchResult = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const match = await prisma.match.findUnique({ where: { id: req.params.matchId } });
    if (!match) return next(notFound("Match"));
    if (match.tournamentId !== req.params.id) return next(notFound("Match"));

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id } });
    if (!tournament) return next(notFound("Tournament"));
    if (tournament.createdById !== req.user!.userId && req.user!.role !== "admin" && req.user!.role !== "organizer") {
      return next(forbidden());
    }
    if (match.status !== "completed") {
      return next(badRequest("El partido no tiene resultado que reiniciar"));
    }

    // For KO matches (no rrGroup), remove the old winner from the next-round slot
    // so the bracket slot is free when a new result is entered.
    if (!match.rrGroup) {
      await undoSEAdvancement(
        match.tournamentId, match.round, match.position, match.winnerId, match.bracketLevel ?? null
      );
    }

    const updated = await prisma.match.update({
      where: { id: req.params.matchId },
      data: {
        score1:   null,
        score2:   null,
        winnerId: null,
        playedAt: null,
        // Keep to pending if never launched, in_progress if already called
        status: match.launch1At ? "in_progress" : "pending",
      },
    });

    return res.json({ data: updated, message: "Resultado del partido reiniciado" });
  } catch (err) { next(err); }
};
