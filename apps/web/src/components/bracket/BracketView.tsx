"use client";

import { useState } from "react";
import { Match, Bracket, BracketRound } from "@tournament/types";
import { clsx } from "clsx";
import { format as fmtDate } from "date-fns";

// ─── Layout constants ─────────────────────────────────────────────────────────

const CARD_W   = 210;
const CARD_H   = 64;
const ROW_H    = 32;
const CELL_H0  = 84;
const LEFT_PAD = 30;
const CONN_W   = 48;
const COL_W    = LEFT_PAD + CARD_W;
const HEADER_H = 44;
const LCELL_H  = 88;

// ─── Routing helpers ──────────────────────────────────────────────────────────
// For each match we pre-compute a label for each empty participant slot so
// users know which match's winner / loser is expected there.

type RoutingMap = Map<string, [string, string]>; // matchId → [slot1Label, slot2Label]

function computeRouting(
  wbRounds: BracketRound[],
  lbRounds: BracketRound[]
): RoutingMap {
  const map: RoutingMap = new Map();

  // ── 1. Sequential match numbers across the whole bracket ──────────────────
  const nums = new Map<string, number>();
  let n = 1;
  for (const r of wbRounds) for (const m of r.matches) nums.set(m.id, n++);
  for (const r of lbRounds) for (const m of r.matches) nums.set(m.id, n++);

  const wbRegular = wbRounds.filter(r => r.round !== 99 && r.round !== 100); // exclude GF and bracket reset

  // ── 2. Winners bracket (rounds 2+): both slots from previous WB round ──────
  for (let ri = 1; ri < wbRegular.length; ri++) {
    for (let mi = 0; mi < wbRegular[ri].matches.length; mi++) {
      const m  = wbRegular[ri].matches[mi];
      const s1 = wbRegular[ri - 1].matches[2 * mi];
      const s2 = wbRegular[ri - 1].matches[2 * mi + 1];
      map.set(m.id, [
        s1 ? `Ganador de ${nums.get(s1.id)}` : "TBD",
        s2 ? `Ganador de ${nums.get(s2.id)}` : "TBD",
      ]);
    }
  }

  // ── 3. Grand Final (round 99): WB winner vs LB Final winner ────────────────
  const gfRound = wbRounds.find(r => r.round === 99);
  if (gfRound) {
    const gf      = gfRound.matches[0];
    const wbFinal = wbRegular[wbRegular.length - 1]?.matches[0];
    const lbFinal = lbRounds[lbRounds.length - 1]?.matches[0];
    if (gf) {
      map.set(gf.id, [
        wbFinal ? `Ganador de ${nums.get(wbFinal.id)}` : "TBD",
        lbFinal ? `Ganador de ${nums.get(lbFinal.id)}` : "TBD",
      ]);
    }
  }

  // ── 3b. Bracket Reset (round 100): same two players as GF ──────────────────
  const resetRound = wbRounds.find(r => r.round === 100);
  if (resetRound) {
    const reset = resetRound.matches[0];
    const gf    = gfRound?.matches[0];
    if (reset) {
      map.set(reset.id, [
        gf ? `Ganador de ${nums.get(gf.id)}` : "TBD",
        gf ? `Perdedor de ${nums.get(gf.id)}` : "TBD",
      ]);
    }
  }

  // ── 4. Losers bracket ────────────────────────────────────────────────────────
  // Odd LB rounds (1, 3, 5…) = consolidation — LB survivors play each other
  //   LB R1: both slots from WB R1 losers (paired as 2mi, 2mi+1)
  //   LB R3+: both slots from previous LB round winners
  // Even LB rounds (2, 4, 6…) = merge — slot1=LB survivor, slot2=WB loser

  for (let li = 0; li < lbRounds.length; li++) {
    const r  = li + 1; // 1-indexed LB round
    const isConsolidation = r % 2 === 1;

    for (let mi = 0; mi < lbRounds[li].matches.length; mi++) {
      const m = lbRounds[li].matches[mi];

      if (isConsolidation) {
        if (r === 1) {
          // LB R1: losers from WB R1 at positions 2mi and 2mi+1.
          // WB BYE matches produce no loser → show "BYE" for that slot.
          const wbR1 = wbRegular[0];
          const s1   = wbR1?.matches[2 * mi];
          const s2   = wbR1?.matches[2 * mi + 1];
          const slotLbl = (s: typeof s1) =>
            !s ? "" : s.status === "bye" ? "BYE" : `Perdedor de ${nums.get(s.id)}`;
          map.set(m.id, [slotLbl(s1), slotLbl(s2)]);
        } else {
          // LB R3, R5…: winners from the previous LB round
          const prev = lbRounds[li - 1];
          const s1   = prev?.matches[2 * mi];
          const s2   = prev?.matches[2 * mi + 1];
          map.set(m.id, [
            s1 ? `Ganador de ${nums.get(s1.id)}` : "TBD",
            s2 ? `Ganador de ${nums.get(s2.id)}` : "TBD",
          ]);
        }
      } else {
        // LB R2, R4, R6…: LB prev-round winner (pos mi) + WB drop-in loser (cross-seeded)
        // LB R(2k) drops from WB R(k+1) → wbRegular index k
        // Cross-seeding: always mirror within adjacent pairs (pos 0↔1, 2↔3…)
        // Fall back to same position when only 1 WB match exists (WB Final).
        const k            = r / 2;
        const wbDropRound  = wbRegular[k]; // WB R(k+1)
        const mirroredPos  = mi % 2 === 0 ? mi + 1 : mi - 1;
        const prevLB       = lbRounds[li - 1];
        const lbSrc        = prevLB?.matches[mi];
        // Use mirrored pos if that WB match exists, else same pos (WB Final edge case)
        const wbSrc        = wbDropRound?.matches[mirroredPos] ?? wbDropRound?.matches[mi];
        map.set(m.id, [
          lbSrc ? `Ganador de ${nums.get(lbSrc.id)}` : "TBD",
          wbSrc ? `Perdedor de ${nums.get(wbSrc.id)}` : "TBD",
        ]);
      }
    }
  }

  return map;
}

// ─── Diana badge (shown above a match card when a diana is assigned) ─────────

function DianaBadge({ match }: { match: Match }) {
  const diana    = match.diana;
  const isNoShow = !!match.noShowAt;

  // Nothing to show if no diana AND no no-show times
  if (!diana && !isNoShow) return null;

  const fmt = (iso?: string | null) =>
    iso ? fmtDate(new Date(iso), "HH:mm") : null;

  // For normal (non-no-show) mode: show most-recent call label + time
  const calls: [string | null | undefined, string][] = [
    [match.launch3At, "3ª"],
    [match.launch2At, "2ª"],
    [match.launch1At, "1ª"],
  ];
  const [lastCallTime, lastCallLabel] = calls.find(([t]) => !!t) ?? [null, ""];

  return (
    <div
      style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 1, whiteSpace: "nowrap" }}
    >
      {isNoShow ? (
        /* ── No-show mode: only diana pill above the card ── */
        diana && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-red-900/60 text-red-400 border border-red-700/50">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="6" cy="6" r="0.8" fill="currentColor"/>
              </svg>
              {diana.number}
            </span>
          </div>
        )
      ) : (
        /* ── Normal mode: diana pill + last call time ── */
        diana && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-amber-950/60 text-amber-400 border border-amber-700/50">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 shrink-0" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="6" cy="6" r="0.8" fill="currentColor"/>
              </svg>
              {diana.number}
            </span>
            {lastCallTime && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono text-amber-500/80">
                {lastCallLabel} {fmt(lastCallTime)}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ─── NoShowInfoModal ──────────────────────────────────────────────────────────

function NoShowInfoModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const fmt = (iso?: string | null) => iso ? fmtDate(new Date(iso), "HH:mm:ss") : null;

  const noShowParticipant =
    match.participant1?.id === match.winnerId ? match.participant2 : match.participant1;
  const noShowName =
    noShowParticipant?.user?.name ?? noShowParticipant?.team?.name ?? "Jugador";

  const rows: { label: string; time: string | null; highlight?: boolean }[] = [
    { label: "1ª llamada", time: fmt(match.launch1At) },
    { label: "2ª llamada", time: fmt(match.launch2At) },
    { label: "3ª llamada", time: fmt(match.launch3At) },
    { label: "No presentado", time: fmt(match.noShowAt), highlight: true },
  ].filter(r => r.time !== null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1a1a] border border-red-800/50 rounded-2xl w-full max-w-xs p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
            {/* warning icon */}
            <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none">
              <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="8" cy="12" r="0.7" fill="currentColor"/>
            </svg>
            No presentado
          </h3>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors text-lg leading-none">×</button>
        </div>

        {/* Player name */}
        <p className="text-sm text-white font-semibold line-through decoration-red-500 decoration-2 text-red-400/80">
          {noShowName}
        </p>

        {/* Time log */}
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between">
              <span className={clsx("text-xs", r.highlight ? "text-red-400 font-semibold" : "text-[#666]")}>
                {r.label}
              </span>
              <span className={clsx("text-xs font-mono", r.highlight ? "text-red-400 font-semibold" : "text-[#888]")}>
                {r.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

interface PlayerRowProps {
  seed?:         number | null;
  name:          string;
  score?:        number | null;
  winner:        boolean;
  isBye?:        boolean;
  empty?:        boolean;
  isRouting?:    boolean; // true when name is a routing placeholder
  isNoShow?:     boolean; // true when this player didn't show up
}

function PlayerRow({ seed, name, score, winner, isBye, empty, isRouting, isNoShow }: PlayerRowProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 px-1.5 transition-colors",
        isNoShow
          ? "bg-red-950/40 border-l-[3px] border-red-600"
          : winner
          ? "bg-amber-900/25 border-l-[3px] border-amber-500"
          : "bg-[#222222] border-l-[3px] border-transparent"
      )}
      style={{ height: ROW_H }}
    >
      <span
        className={clsx(
          "shrink-0 w-5 text-center text-[10px] font-mono rounded-sm py-0.5",
          isNoShow ? "text-red-700" : winner ? "text-amber-400" : "text-[#555]"
        )}
      >
        {seed ?? ""}
      </span>

      <span
        className={clsx(
          "flex-1 text-[12px] truncate",
          empty || isBye || isRouting
            ? "text-[#555] italic"
            : isNoShow
            ? "line-through text-red-500/70 decoration-red-500 decoration-[1.5px]"
            : winner
            ? "text-white font-semibold"
            : "text-[#bbb]"
        )}
      >
        {name}
      </span>

      {/* N/P badge for no-show player */}
      {isNoShow && (
        <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-bold bg-red-900/60 text-red-400 border border-red-700/50 mr-0.5">
          N/P
        </span>
      )}

      {score != null && !isBye && !empty && !isRouting && !isNoShow && (
        <span
          className={clsx(
            "shrink-0 text-[13px] font-mono font-bold mr-1",
            winner ? "text-amber-400" : "text-[#555]"
          )}
        >
          {score}
        </span>
      )}

      {winner && !isNoShow && (
        <span className="shrink-0 w-[18px] h-[18px] bg-amber-500 rounded-[3px] flex items-center justify-center mr-0.5">
          <svg viewBox="0 0 12 10" className="w-3 h-3 fill-white">
            <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

interface MatchCardProps {
  match:           Match;
  matchNum:        number;
  top:             number;
  left:            number;
  onReport?:       (m: Match) => void;
  canReport?:      boolean;
  onNoShowInfo?:   (m: Match) => void;
  routingLabel1?:  string;
  routingLabel2?:  string;
  isConditional?:  boolean;
  localSeeds?:     Map<string, number>;
}

function MatchCard({
  match, matchNum, top, left, onReport, canReport, onNoShowInfo,
  routingLabel1, routingLabel2, isConditional, localSeeds,
}: MatchCardProps) {
  const p1     = match.participant1;
  const p2     = match.participant2;
  const done   = match.status === "completed";
  const isBye  = match.status === "bye";
  // Only show "BYE" text for the empty slot — when a real player IS present (e.g. LB singleton
  // auto-advanced), show their name normally instead of replacing it with "BYE".
  const showByeSlot = isBye && !p2;
  // Completed matches can be clicked to edit/reset the result (unless it was a no-show)
  const canClick     = canReport && !isBye && p1 && p2 &&
                       (match.status === "pending" || match.status === "in_progress" ||
                        (match.status === "completed" && !match.noShowAt));
  const isNoShowCard = !!match.noShowAt;

  const isWin1 = done && !!p1 && match.winnerId === p1.id;
  const isWin2 = done && !!p2 && match.winnerId === p2.id;

  // No-show: the loser is the player who didn't show up
  const noShowId = match.noShowAt
    ? (p1?.id === match.winnerId ? p2?.id : p1?.id)
    : null;
  const isNoShow1 = !!noShowId && noShowId === p1?.id;
  const isNoShow2 = !!noShowId && noShowId === p2?.id;

  const resolveName = (p: Match["participant1"], routing?: string) => {
    if (p) return p.user?.name ?? p.team?.name ?? "???";
    return routing ?? "TBD";
  };

  const name1 = resolveName(p1, routingLabel1);
  const name2 = resolveName(p2, routingLabel2);

  return (
    <div style={{ position: "absolute", top, left, opacity: isConditional ? 0.45 : 1 }}>
      {/* Relative wrapper so the badge can anchor to bottom: 100% */}
      <div style={{ position: "relative" }}>
      {/* Diana badge — show when a diana is assigned to this match */}
      <DianaBadge match={match} />

      <span
        className="absolute text-[11px] font-mono text-[#555] select-none"
        style={{ right: CARD_W + 6, top: "50%", transform: "translateY(-50%)" }}
      >
        {matchNum}
      </span>

      <div
        className={clsx(
          "border rounded-[3px] overflow-hidden select-none",
          isNoShowCard
            ? "border-red-800/70 cursor-pointer"
            : isConditional
            ? "border-[#2a2a2a]"
            : "border-[#383838]",
          canClick && done
            ? "hover:border-blue-600/50 cursor-pointer"
            : canClick && "hover:border-amber-600/50 cursor-pointer"
        )}
        style={{ width: CARD_W }}
        onClick={() => {
          if (isNoShowCard) { onNoShowInfo?.(match); return; }
          if (canClick) onReport?.(match);
        }}
        title={
          isNoShowCard ? "Ver registro de llamadas" :
          canClick && done ? "Editar o reiniciar resultado" :
          canClick ? (match.launch1At ? "Reportar resultado" : "Asignar diana y lanzar") :
          isConditional ? "Si necesario" : undefined
        }
      >
        <PlayerRow
          seed={p1 ? (localSeeds?.get(p1.id) ?? p1.seed) : undefined}
          name={name1}
          score={match.score1}
          winner={isWin1}
          empty={!p1 && !routingLabel1}
          isRouting={!p1 && !!routingLabel1}
          isNoShow={isNoShow1}
        />
        <div className={clsx("h-px", match.noShowAt ? "bg-red-900/40" : "bg-[#333]")} />
        <PlayerRow
          seed={p2 ? (localSeeds?.get(p2.id) ?? p2.seed) : undefined}
          name={showByeSlot ? "BYE" : name2}
          score={match.score2}
          winner={isWin2}
          isBye={showByeSlot}
          empty={!p2 && !showByeSlot && !routingLabel2}
          isRouting={!p2 && !showByeSlot && !!routingLabel2}
          isNoShow={isNoShow2}
        />
      </div>
      </div>
    </div>
  );
}

// ─── BracketSection (Winners) ─────────────────────────────────────────────────

interface SectionProps {
  rounds:          Bracket["rounds"];
  startMatchNum:   number;
  routing:         RoutingMap;
  onReport?:       (m: Match) => void;
  canReport?:      boolean;
  onNoShowInfo?:   (m: Match) => void;
  localSeeds?:     Map<string, number>;
}

// Effective cell-height multiplier for a round.
// The Grand Final (round 99) and bracket-reset (round 100) share the same scale
// as the WB Final so they render horizontally aligned instead of being pushed down.
function chRForIndex(rIdx: number, rounds: BracketRound[]): number {
  const round = rounds[rIdx]?.round;
  if (round === 99) return CELL_H0 * Math.pow(2, Math.max(0, rIdx - 1));
  if (round === 100) return CELL_H0 * Math.pow(2, Math.max(0, rIdx - 2));
  return CELL_H0 * Math.pow(2, rIdx);
}

function BracketSection({ rounds, startMatchNum, routing, onReport, canReport, onNoShowInfo, localSeeds }: SectionProps) {
  if (!rounds || rounds.length === 0) return null;

  const M0        = rounds[0].matches.length;
  const numRounds = rounds.length;
  const totalH    = HEADER_H + M0 * CELL_H0;
  const totalW    = numRounds * COL_W + (numRounds - 1) * CONN_W + 16;

  const connectors: string[] = [];
  for (let rIdx = 0; rIdx < numRounds - 1; rIdx++) {
    const chR    = chRForIndex(rIdx, rounds);
    const xLeft  = rIdx * (COL_W + CONN_W) + LEFT_PAD + CARD_W;
    const xRight = (rIdx + 1) * (COL_W + CONN_W) + LEFT_PAD;
    const xMid   = (xLeft + xRight) / 2;

    const curCount  = rounds[rIdx].matches.length;
    const nextCount = rounds[rIdx + 1].matches.length;

    if (curCount === nextCount) {
      // 1-to-1 pass-through (WB Final → Grand Final): simple horizontal line
      for (let j = 0; j < curCount; j++) {
        const y = HEADER_H + j * chR + chR / 2;
        connectors.push(`M${xLeft},${y} H${xRight}`);
      }
    } else {
      // Standard fork: two source matches → one destination
      for (let j = 0; j < nextCount; j++) {
        const y1      = HEADER_H + (2 * j)     * chR + chR / 2;
        const y2      = HEADER_H + (2 * j + 1) * chR + chR / 2;
        const yTarget = HEADER_H + j * chR * 2 + chR;
        connectors.push(
          `M${xLeft},${y1} H${xMid} M${xLeft},${y2} H${xMid} M${xMid},${y1} V${y2} M${xMid},${yTarget} H${xRight}`
        );
      }
    }
  }

  let matchCounter = startMatchNum;

  return (
    <div style={{ position: "relative", width: totalW, height: totalH, minWidth: totalW }}>
      {rounds.map((round, rIdx) => {
        const left = rIdx * (COL_W + CONN_W) + LEFT_PAD;
        return (
          <div key={round.round}
            style={{ position: "absolute", left, top: 0, width: CARD_W, height: HEADER_H }}
            className="flex flex-col items-center justify-end pb-2 gap-0.5"
          >
            <span className={clsx(
              "text-[11px] font-semibold tracking-wider uppercase",
              round.round === 100 ? "text-[#555]" : "text-[#888]"
            )}>
              {round.name}
            </span>
            {round.round === 100 && (
              <span className="text-[9px] text-[#444] italic tracking-wide">si necesario</span>
            )}
          </div>
        );
      })}

      {/* clip so long SVG paths never bleed into the LB section below */}
      <svg style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "hidden" }}
        width={totalW} height={totalH}>
        {connectors.map((d, i) => (
          <path key={i} d={d} stroke="#3a3a3a" strokeWidth={1.5} fill="none" />
        ))}
      </svg>

      {rounds.map((round, rIdx) => {
        const chR   = chRForIndex(rIdx, rounds);
        const xLeft = rIdx * (COL_W + CONN_W) + LEFT_PAD;
        // Round 100 is conditional (bracket reset) — dim it until activated
        const isBracketReset = round.round === 100;
        return round.matches.map((match, mIdx) => {
          const top  = HEADER_H + mIdx * chR + (chR - CARD_H) / 2;
          const num  = matchCounter++;
          const [rl1, rl2] = routing.get(match.id) ?? ["", ""];
          // Conditional when round 100 hasn't been activated (no participants yet)
          const conditional = isBracketReset && !match.participant1 && !match.participant2 && match.status !== "bye";
          return (
            <MatchCard key={match.id} match={match} matchNum={num} top={top} left={xLeft}
              onReport={onReport} canReport={canReport} onNoShowInfo={onNoShowInfo}
              routingLabel1={rl1 || undefined} routingLabel2={rl2 || undefined}
              isConditional={conditional}
              localSeeds={localSeeds}
            />
          );
        });
      })}
    </div>
  );
}

// ─── LosersBracketSection ────────────────────────────────────────────────────

function LosersBracketSection({ rounds, startMatchNum, routing, onReport, canReport, onNoShowInfo, localSeeds }: SectionProps) {
  if (!rounds || rounds.length === 0) return null;

  const numRounds  = rounds.length;
  const maxMatches = Math.max(...rounds.map(r => r.matches.length));
  const totalH     = HEADER_H + maxMatches * LCELL_H;
  const totalW     = numRounds * COL_W + (numRounds - 1) * CONN_W + 16;

  const connectors: string[] = [];
  for (let rIdx = 0; rIdx < numRounds - 1; rIdx++) {
    const curCount  = rounds[rIdx].matches.length;
    const nextCount = rounds[rIdx + 1].matches.length;
    const xLeft     = rIdx * (COL_W + CONN_W) + LEFT_PAD + CARD_W;
    const xRight    = (rIdx + 1) * (COL_W + CONN_W) + LEFT_PAD;
    const xMid      = (xLeft + xRight) / 2;

    const yCenter = (i: number, total: number) =>
      HEADER_H + i * (totalH - HEADER_H) / total + (totalH - HEADER_H) / total / 2;

    if (nextCount * 2 === curCount) {
      // Consolidation: two matches merge into one
      for (let j = 0; j < nextCount; j++) {
        const y1 = yCenter(2 * j,     curCount);
        const y2 = yCenter(2 * j + 1, curCount);
        const yT = yCenter(j,          nextCount);
        connectors.push(
          `M${xLeft},${y1} H${xMid} M${xLeft},${y2} H${xMid} M${xMid},${y1} V${y2} M${xMid},${yT} H${xRight}`
        );
      }
    } else {
      // Merge / feed: one-to-one
      for (let j = 0; j < Math.min(curCount, nextCount); j++) {
        const y1 = yCenter(j, curCount);
        const yT = yCenter(j, nextCount);
        connectors.push(
          `M${xLeft},${y1} H${xMid} M${xMid},${y1} V${yT} M${xMid},${yT} H${xRight}`
        );
      }
    }
  }

  let matchCounter = startMatchNum;

  return (
    <div style={{ position: "relative", width: totalW, height: totalH, minWidth: totalW }}>
      {rounds.map((round, rIdx) => {
        const left = rIdx * (COL_W + CONN_W) + LEFT_PAD;
        return (
          <div key={round.round}
            style={{ position: "absolute", left, top: 0, width: CARD_W, height: HEADER_H }}
            className="flex items-end justify-center pb-2"
          >
            <span className="text-[11px] font-semibold tracking-wider text-[#666] uppercase">
              {round.name}
            </span>
          </div>
        );
      })}

      <svg style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}
        width={totalW} height={totalH}>
        {connectors.map((d, i) => (
          <path key={i} d={d} stroke="#333" strokeWidth={1.5} fill="none" />
        ))}
      </svg>

      {rounds.map((round, rIdx) => {
        const count = round.matches.length;
        const xLeft = rIdx * (COL_W + CONN_W) + LEFT_PAD;
        return round.matches.map((match, mIdx) => {
          const slotH = (totalH - HEADER_H) / count;
          const top   = HEADER_H + mIdx * slotH + (slotH - CARD_H) / 2;
          const num   = matchCounter++;
          const [rl1, rl2] = routing.get(match.id) ?? ["", ""];
          return (
            <MatchCard key={match.id} match={match} matchNum={num} top={top} left={xLeft}
              onReport={onReport} canReport={canReport} onNoShowInfo={onNoShowInfo}
              routingLabel1={rl1 || undefined} routingLabel2={rl2 || undefined}
              localSeeds={localSeeds}
            />
          );
        });
      })}
    </div>
  );
}

// ─── Local-seed helper ───────────────────────────────────────────────────────
// Collects every participant that appears in the bracket, sorts them by their
// global seed, and maps participant-id → local position (1-based).
// This ensures an 8-player bracket always shows seeds 1-8 regardless of the
// participants' global seed numbers.

function buildLocalSeeds(allRounds: BracketRound[]): Map<string, number> {
  const seen = new Map<string, number | null | undefined>(); // id → global seed
  for (const r of allRounds) {
    for (const m of r.matches) {
      if (m.participant1) seen.set(m.participant1.id, m.participant1.seed);
      if (m.participant2) seen.set(m.participant2.id, m.participant2.seed);
    }
  }
  // Sort: seeded (ascending) first, then unseeded in original insertion order
  const entries = [...seen.entries()];
  entries.sort(([, sa], [, sb]) => {
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sa - sb;
  });
  const map = new Map<string, number>();
  entries.forEach(([id], idx) => map.set(id, idx + 1));
  return map;
}

// ─── Public BracketView ───────────────────────────────────────────────────────

interface BracketViewProps {
  bracket:    Bracket;
  onReport?:  (m: Match) => void;
  canReport?: boolean;
}

export function BracketView({ bracket, onReport, canReport }: BracketViewProps) {
  const [noShowInfo, setNoShowInfo] = useState<Match | null>(null);

  const hasLosers    = (bracket.losersRounds?.length ?? 0) > 0;
  const losersRounds = bracket.losersRounds ?? [];

  const routing = computeRouting(bracket.rounds, losersRounds);

  // Build local (bracket-relative) seed numbers so an 8-player bracket shows 1-8
  const localSeeds = buildLocalSeeds([...bracket.rounds, ...losersRounds]);

  const winnersTotal = bracket.rounds.reduce((s, r) => s + r.matches.length, 0);

  return (
    <>
      {noShowInfo && (
        <NoShowInfoModal match={noShowInfo} onClose={() => setNoShowInfo(null)} />
      )}

      <div className="overflow-x-auto overflow-y-auto w-full">
        <BracketSection
          rounds={bracket.rounds}
          startMatchNum={1}
          routing={routing}
          onReport={onReport}
          canReport={canReport}
          onNoShowInfo={setNoShowInfo}
          localSeeds={localSeeds}
        />

        {hasLosers && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-[#2a2a2a]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#555] px-3">
                Cuadro de perdedores
              </span>
              <div className="h-px flex-1 bg-[#2a2a2a]" />
            </div>

            <LosersBracketSection
              rounds={losersRounds}
              startMatchNum={winnersTotal + 1}
              routing={routing}
              onReport={onReport}
              canReport={canReport}
              onNoShowInfo={setNoShowInfo}
              localSeeds={localSeeds}
            />
          </>
        )}
      </div>
    </>
  );
}
