type ParticipantRow = {
  id:        string;
  seed:      number | null;
  teamName?: string | null;
  provincia?: string | null;
};

type MatchCreate = {
  round: number;
  position: number;
  bracketSide: string | null;
  rrGroup: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  status: "pending" | "bye" | "in_progress" | "completed";
  score1: number | null;
  score2: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sort participants by seed (unseeded go last, ordered by insertion) */
function sortBySeeds(participants: ParticipantRow[]): ParticipantRow[] {
  const seeded = participants.filter((p) => p.seed !== null).sort((a, b) => a.seed! - b.seed!);
  const unseeded = participants.filter((p) => p.seed === null);
  return [...seeded, ...unseeded];
}

/** Next power of two >= n */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard seeded bracket pairing for `size` players (must be a power of 2).
 * Returns size/2 pairs [i, j] (0-indexed seeds) such that:
 *   seed 0 plays seed (size-1), seed 1 plays seed (size-2), etc.
 * with correct bracket ordering so top seeds can only meet in later rounds.
 *
 * Algorithm: build the bracket array by repeatedly interleaving:
 *   [1,2] → [1,4,2,3] → [1,8,4,5,2,7,3,6] for size=8
 */
function seededPairs(size: number): [number, number][] {
  let arr = [1, 2]; // 1-indexed seeds
  let current = 2;

  while (current < size) {
    const next: number[] = [];
    const complement = current * 2 + 1; // e.g. 5 for current=2, 9 for current=4
    for (const s of arr) {
      next.push(s);
      next.push(complement - s);
    }
    arr = next;
    current *= 2;
  }

  // Convert to 0-indexed pairs
  const pairs: [number, number][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push([arr[i] - 1, arr[i + 1] - 1]);
  }
  return pairs;
}

// ─── Single Elimination ───────────────────────────────────────────────────────

export function generateSingleElimination(participants: ParticipantRow[]): MatchCreate[] {
  const sorted = sortBySeeds(participants);
  const size = nextPowerOfTwo(sorted.length);
  const matches: MatchCreate[] = [];

  // Round 1 — pair by seeds; players beyond real count get BYE
  const pairs = seededPairs(size);
  let position = 0;

  for (const [i, j] of pairs) {
    const p1 = sorted[i] ?? null;
    const p2 = j >= 0 && j < sorted.length ? sorted[j] : null;
    const isBye = p2 === null;

    matches.push({
      round: 1,
      position: position++,
      bracketSide: "winners",
      rrGroup: null,
      participant1Id: p1?.id ?? null,
      participant2Id: p2?.id ?? null,
      winnerId: isBye ? p1?.id ?? null : null,
      status: isBye ? "bye" : "pending",
      score1: null,
      score2: null,
    });
  }

  // Subsequent rounds — empty slots (filled as results come in)
  let prevRoundSize = pairs.length;
  let round = 2;
  while (prevRoundSize > 1) {
    const roundSize = prevRoundSize / 2;
    for (let pos = 0; pos < roundSize; pos++) {
      matches.push({
        round,
        position: pos,
        bracketSide: "winners",
        rrGroup: null,
        participant1Id: null,
        participant2Id: null,
        winnerId: null,
        status: "pending",
        score1: null,
        score2: null,
      });
    }
    prevRoundSize = roundSize;
    round++;
  }

  return matches;
}

// ─── Double Elimination ───────────────────────────────────────────────────────
//
// Proper Challonge-style structure for N players (size = next power of 2):
//
//   Winners:  R1 (size/2 matches), R2, … WB Final — total log2(size) rounds
//   Losers:   Alternating consolidation / merge rounds:
//               LB R1  (consolidation): size/4 matches  ← WB R1 losers play each other
//               LB R2  (merge):         size/4 matches  ← LB R1 winners vs WB R2 losers
//               LB R3  (consolidation): size/8 matches
//               LB R4  (merge):         size/8 matches  ← vs WB R3 losers
//               …
//               LB Final (merge):       1 match         ← last survivor vs WB Final loser
//   Grand Final: 1 match (WB Final winner vs LB Final winner)
//
// Odd LB rounds = consolidation (count stays same as previous round).
// Even LB rounds = merge (count halves).
// Total LB rounds = (log2(size) - 1) * 2

export function generateDoubleElimination(participants: ParticipantRow[]): MatchCreate[] {
  const size = nextPowerOfTwo(participants.length);
  const matches: MatchCreate[] = [];

  // ── Winners bracket ──────────────────────────────────────────────────────────
  const winnersMatches = generateSingleElimination(participants);
  matches.push(...winnersMatches.map(m => ({ ...m, bracketSide: "winners" as const })));

  // ── Losers bracket ───────────────────────────────────────────────────────────
  // LB R1 starts with size/4 matches (half of WB R1 losers paired up)
  const totalWBRounds  = Math.log2(size);       // e.g. 3 for size=8, 4 for size=16
  const totalLBRounds  = (totalWBRounds - 1) * 2; // e.g. 4 for size=8
  let   lbMatchCount   = size / 4;              // LB R1 count

  for (let r = 1; r <= totalLBRounds; r++) {
    for (let pos = 0; pos < lbMatchCount; pos++) {
      matches.push({
        round: r,
        position: pos,
        bracketSide: "losers",
        rrGroup: null,
        participant1Id: null,
        participant2Id: null,
        winnerId: null,
        status: "pending",
        score1: null,
        score2: null,
      });
    }

    // After odd rounds (consolidation): count stays same (next is a merge round).
    // After even rounds (merge): halve count (next is a consolidation round).
    if (r % 2 === 0) {
      lbMatchCount = Math.max(1, Math.floor(lbMatchCount / 2));
    }
  }

  // ── Grand Final ──────────────────────────────────────────────────────────────
  matches.push({
    round: 99,
    position: 0,
    bracketSide: "winners",
    rrGroup: null,
    participant1Id: null,
    participant2Id: null,
    winnerId: null,
    status: "pending",
    score1: null,
    score2: null,
  });

  // ── Bracket Reset (round 100) — only played if LB finalist wins Grand Final ──
  matches.push({
    round: 100,
    position: 0,
    bracketSide: "winners",
    rrGroup: null,
    participant1Id: null,
    participant2Id: null,
    winnerId: null,
    status: "pending",
    score1: null,
    score2: null,
  });

  return matches;
}

// ─── Round Robin ──────────────────────────────────────────────────────────────
//
// Generates all n-1 rounds using the circle method, then re-orders the rounds
// so that matches between players from the same TEAM appear in the earliest
// rounds (priority = 3), followed by matches between players from the same
// PROVINCE (priority = 1). If all players share the same province the province
// constraint is ignored and only the team constraint applies.
//
// Key insight: all n-1 rounds are mutually independent — any permutation of
// rounds is still a valid round-robin schedule.

export function generateRoundRobin(participants: ParticipantRow[], groupName: string | null = null): MatchCreate[] {
  const sorted = sortBySeeds(participants);
  const n = sorted.length;

  // Build a lookup map for O(1) team/province access
  const pMap = new Map<string, ParticipantRow>(sorted.map(p => [p.id, p]));

  // Detect "all same province" — in that case province is meaningless as a
  // differentiator, so we only use team affinity.
  const provinces = sorted.map(p => p.provincia ?? "").filter(Boolean);
  const allSameProvince =
    provinces.length === sorted.length &&
    provinces.every(v => v === provinces[0]);

  // If odd, add a "bye" placeholder
  const list: (ParticipantRow | null)[] = n % 2 === 0 ? [...sorted] : [...sorted, null];
  const totalRounds = list.length - 1;
  const half = list.length / 2;

  // ── Step 1: collect every round as its own array ──────────────────────────
  const roundBuckets: MatchCreate[][] = [];

  for (let r = 1; r <= totalRounds; r++) {
    const bucket: MatchCreate[] = [];
    let position = 0;
    for (let i = 0; i < half; i++) {
      const p1 = list[i];
      const p2 = list[list.length - 1 - i];
      const isBye = p1 === null || p2 === null;
      bucket.push({
        round:          r,   // temporary; will be overwritten after sorting
        position:       position++,
        bracketSide:    null,
        rrGroup:        groupName,
        participant1Id: p1?.id ?? null,
        participant2Id: p2?.id ?? null,
        winnerId:       null,
        status:         isBye ? "bye" : "pending",
        score1:         null,
        score2:         null,
      });
    }
    roundBuckets.push(bucket);

    // Rotate all but the first element (circle method)
    const rotating = list.slice(1);
    rotating.unshift(rotating.pop()!);
    list.splice(1, rotating.length, ...rotating);
  }

  // ── Step 2: score each round ──────────────────────────────────────────────
  const scoreRound = (bucket: MatchCreate[]): number => {
    let score = 0;
    for (const m of bucket) {
      if (!m.participant1Id || !m.participant2Id) continue;
      const p1 = pMap.get(m.participant1Id);
      const p2 = pMap.get(m.participant2Id);
      if (!p1 || !p2) continue;

      const sameTeam =
        p1.teamName && p2.teamName &&
        p1.teamName.trim().toLowerCase() === p2.teamName.trim().toLowerCase();

      if (sameTeam) {
        score += 3;
      } else if (
        !allSameProvince &&
        p1.provincia && p2.provincia &&
        p1.provincia.trim().toLowerCase() === p2.provincia.trim().toLowerCase()
      ) {
        score += 1;
      }
    }
    return score;
  };

  // ── Step 3: sort rounds by score descending (highest-priority first) ──────
  roundBuckets.sort((a, b) => scoreRound(b) - scoreRound(a));

  // ── Step 4: reassemble with sequential round numbers ──────────────────────
  const result: MatchCreate[] = [];
  roundBuckets.forEach((bucket, idx) => {
    bucket.forEach(m => result.push({ ...m, round: idx + 1 }));
  });

  return result;
}

// ─── RR Standings computation ─────────────────────────────────────────────────

type ParticipantStub = { id: string };
type MatchStub = {
  participant1Id: string | null;
  participant2Id: string | null;
  participant3Id?: string | null;   // only for 3-player tiebreaker
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  status: string;
  isTiebreaker?: boolean;
};

export interface StandingEntry {
  participantId: string;
  points: number;
  wins: number;
  losses: number;
  setDiff: number;
  rank: number;
  advances: boolean;
  needsTiebreaker?: boolean;
}

/**
 * Compute standings for a single RR group.
 * advancingCount = number of participants that advance to KO.
 *
 * Tiebreaker logic:
 *   1. Sort by points desc
 *   2. 2-way tie: compare head-to-head match result
 *   3. 3-way tie:
 *      a. Filter mutual matches among the 3 tied teams
 *      b. Compute set-difference (score1−score2) among those matches only
 *      c. Sort by set-diff desc
 *   2. Set-diferencia global (todos los partidos del grupo, desc)
 *   3. Enfrentamiento directo (solo si quedan 2 empatados)
 *   4. needsTiebreaker = true (si quedan 3+ empatados y todos sus partidos están completos)
 */
export function computeRRStandings(
  participants: ParticipantStub[],
  matches: MatchStub[],
  advancingCount: number,
): StandingEntry[] {
  const ids = participants.map(p => p.id);
  // Exclude tiebreaker matches from stat calculation (they don't count as regular results)
  const completedMatches = matches.filter(m => m.status === "completed" && !m.isTiebreaker);

  // Build stats (overall set-diff across ALL group matches)
  const stats = new Map<string, { points: number; wins: number; losses: number; setDiff: number }>(
    ids.map(id => [id, { points: 0, wins: 0, losses: 0, setDiff: 0 }])
  );

  for (const m of completedMatches) {
    const s1 = stats.get(m.participant1Id ?? "");
    const s2 = stats.get(m.participant2Id ?? "");
    if (!s1 || !s2) continue;

    const diff1 = (m.score1 ?? 0) - (m.score2 ?? 0);
    const diff2 = -diff1;

    if (m.winnerId === m.participant1Id) {
      s1.points += 1; s1.wins += 1; s1.setDiff += diff1;
      s2.losses += 1; s2.setDiff += diff2;
    } else if (m.winnerId === m.participant2Id) {
      s2.points += 1; s2.wins += 1; s2.setDiff += diff2;
      s1.losses += 1; s1.setDiff += diff1;
    }
  }

  // Primary sort: 1) points desc  2) overall set-diff desc
  const sorted = [...ids].sort((a, b) => {
    const sa = stats.get(a)!;
    const sb = stats.get(b)!;
    if (sb.points !== sa.points) return sb.points - sa.points;
    return sb.setDiff - sa.setDiff;
  });

  // Head-to-head result (returns 1 if aId won, -1 if bId won, 0 if not played / draw)
  function headToHead(aId: string, bId: string): number {
    const m = completedMatches.find(
      m => (m.participant1Id === aId && m.participant2Id === bId) ||
           (m.participant1Id === bId && m.participant2Id === aId)
    );
    if (!m || !m.winnerId) return 0;
    return m.winnerId === aId ? 1 : -1;
  }

  const result: StandingEntry[] = sorted.map((id, idx) => ({
    participantId: id,
    ...stats.get(id)!,
    rank: idx + 1,
    advances: false,
  }));

  // Second pass: find groups still tied after pts + set-diff and apply head-to-head / flag tiebreaker
  let i = 0;
  while (i < result.length) {
    const basePts  = result[i].points;
    const baseDiff = result[i].setDiff;
    let j = i;
    while (
      j < result.length &&
      result[j].points  === basePts &&
      result[j].setDiff === baseDiff
    ) j++;
    const tiedGroup = result.slice(i, j);

    if (tiedGroup.length === 2) {
      // 2-way tie on pts + set-diff → head-to-head decides
      const hh = headToHead(tiedGroup[0].participantId, tiedGroup[1].participantId);
      if (hh < 0) { [result[i], result[i + 1]] = [result[i + 1], result[i]]; }
    } else if (tiedGroup.length >= 3) {
      // 3+-way tie on pts + set-diff → manual tiebreaker needed
      // (only flag once all their mutual matches are complete, to avoid false positives)
      const tiedIds = tiedGroup.map(e => e.participantId);
      const mutualMatches = matches.filter(m => {
        const aId = m.participant1Id ?? "";
        const bId = m.participant2Id ?? "";
        return tiedIds.includes(aId) && tiedIds.includes(bId) && !m.isTiebreaker;
      });
      const allMutualDone = mutualMatches.length > 0 &&
        mutualMatches.every(m => m.status === "completed");
      if (allMutualDone) {
        tiedGroup.forEach(e => { e.needsTiebreaker = true; });
      }
    }

    i = j;
  }

  // ── 3-player tiebreaker override ─────────────────────────────────────────
  // If a completed 3-player tiebreaker match exists (participant3Id set),
  // use its participant order (p1 = 1st, p2 = 2nd, p3 = 3rd) to override
  // the automatic ranking for those three participants.
  const resolvedTiebreaker = matches.find(
    m => m.isTiebreaker && m.status === "completed" && m.participant3Id
  );
  if (resolvedTiebreaker) {
    const order = [
      resolvedTiebreaker.participant1Id,
      resolvedTiebreaker.participant2Id,
      resolvedTiebreaker.participant3Id,
    ].filter(Boolean) as string[];

    // Find the positions these three participants currently occupy
    const positions = order
      .map(id => result.findIndex(e => e.participantId === id))
      .filter(pos => pos !== -1);

    if (positions.length === 3) {
      // Clone entries BEFORE any writes — avoids shared-reference bugs where
      // the same object ends up at two indices and gets the wrong rank/advances.
      const cloned = order.map(id => {
        const e = result.find(r => r.participantId === id);
        return e ? { ...e, needsTiebreaker: false } : null;
      });

      // Write into the lowest three positions occupied by these players
      const sortedPositions = [...positions].sort((a, b) => a - b);
      for (let k = 0; k < 3; k++) {
        if (cloned[k]) result[sortedPositions[k]] = cloned[k]!;
      }
    }
  }

  // Assign final ranks and advances
  result.forEach((e, idx) => {
    e.rank = idx + 1;
    e.advances = idx < advancingCount;
  });

  return result;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function generateBracket(
  format: "single_elimination" | "double_elimination" | "round_robin",
  participants: ParticipantRow[]
): MatchCreate[] {
  switch (format) {
    case "single_elimination":
      return generateSingleElimination(participants);
    case "double_elimination":
      return generateDoubleElimination(participants);
    case "round_robin":
      return generateRoundRobin(participants);
  }
}
