"use client";

import { Match, Participant, Tournament } from "@tournament/types";
import { clsx } from "clsx";
import { Trophy, Medal } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandingEntry {
  rank:      number;
  localSeed: number; // bracket-relative seed (1 = top seed in this bracket)
  participant: Participant;
  wins:   number;
  losses: number;
}

// ─── Rank computation ─────────────────────────────────────────────────────────

export function computeStandings(
  matches:      Match[],
  participants: Participant[],
  format:       string,
  bracketLevel: string | null
): StandingEntry[] {
  // For round_robin + KO format: work only on KO matches (rrGroup = null).
  // Pure RR tournaments (no KO) still use the win-based path.
  const isRRKO = format === "round_robin" &&
    matches.some(m => (m.bracketLevel ?? null) === bracketLevel && !m.rrGroup && m.status === "completed");

  // Filter to this bracket level; for RR+KO only take KO matches.
  const lvl = matches.filter(
    m => (m.bracketLevel ?? null) === bracketLevel &&
         m.status === "completed" &&
         m.winnerId &&
         (!isRRKO || !m.rrGroup)   // skip RR-group matches when KO phase exists
  );

  // Helper: get participant IDs from a match (frontend type uses nested objects)
  const p1id = (m: Match) => m.participant1?.id ?? null;
  const p2id = (m: Match) => m.participant2?.id ?? null;

  // Participant IDs that actually appear in KO matches (or all matches for pure RR)
  const activeIds = new Set<string>();
  for (const m of lvl) {
    const a = p1id(m); const b = p2id(m);
    if (a) activeIds.add(a);
    if (b) activeIds.add(b);
  }

  const activeParts = participants.filter(p => activeIds.has(p.id));

  // W/L record (scoped to the filtered matches)
  const wins   = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const m of lvl) {
    if (!m.winnerId) continue;
    const loserId = p1id(m) === m.winnerId ? p2id(m) : p1id(m);
    wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
    if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
  }

  const rankMap = new Map<string, number>();

  // ── Single elimination (and RR+KO — same bracket logic) ───────────────────
  if (format === "single_elimination" || isRRKO) {
    const wbDone = lvl
      .filter(m => m.bracketSide !== "losers")
      .sort((a, b) => b.round - a.round);

    if (wbDone[0]?.winnerId) rankMap.set(wbDone[0].winnerId, 1);

    const byRound = new Map<number, string[]>();
    for (const m of wbDone) {
      if (!m.winnerId) continue;
      const loserId = p1id(m) === m.winnerId ? p2id(m) : p1id(m);
      if (!loserId || rankMap.has(loserId)) continue;
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(loserId);
    }

    let nextRank = 2;
    for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
      const losers = byRound.get(round)!;
      losers.forEach(id => rankMap.set(id, nextRank));
      nextRank += losers.length;
    }

  // ── Double elimination ─────────────────────────────────────────────────────
  } else if (format === "double_elimination") {
    // Champion / runner-up from the last WB match (GF2 or GF)
    const wbDone = lvl
      .filter(m => m.bracketSide !== "losers")
      .sort((a, b) => b.round - a.round);

    const finalMatch = wbDone[0];
    if (finalMatch?.winnerId) {
      rankMap.set(finalMatch.winnerId, 1);
      const loserId =
        p1id(finalMatch) === finalMatch.winnerId ? p2id(finalMatch) : p1id(finalMatch);
      if (loserId) rankMap.set(loserId, 2);
    }

    // LB elimination order: later round = better rank
    const lbDone = lvl.filter(m => m.bracketSide === "losers");
    const byRound = new Map<number, string[]>();
    for (const m of lbDone) {
      if (!m.winnerId) continue;
      const loserId = p1id(m) === m.winnerId ? p2id(m) : p1id(m);
      if (!loserId || rankMap.has(loserId)) continue;
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(loserId);
    }

    let nextRank = 3;
    for (const round of [...byRound.keys()].sort((a, b) => b - a)) {
      const losers = byRound.get(round)!;
      losers.forEach(id => rankMap.set(id, nextRank));
      nextRank += losers.length;
    }

  // ── Pure Round Robin (no KO phase) ────────────────────────────────────────
  } else if (format === "round_robin") {
    const sorted = [...activeParts].sort(
      (a, b) => (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0)
    );
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (wins.get(sorted[i].id) ?? 0) < (wins.get(sorted[i - 1].id) ?? 0)) {
        rank = i + 1;
      }
      rankMap.set(sorted[i].id, rank);
    }
  }

  // Build bracket-relative seeds: sort participants by global seed, assign 1..N
  const sortedBySeed = [...activeParts].sort((a, b) => {
    if (a.seed == null && b.seed == null) return 0;
    if (a.seed == null) return 1;
    if (b.seed == null) return -1;
    return a.seed - b.seed;
  });
  const localSeedMap = new Map<string, number>();
  sortedBySeed.forEach((p, idx) => localSeedMap.set(p.id, idx + 1));

  // Build final list
  const entries: StandingEntry[] = activeParts.map(p => ({
    rank:        rankMap.get(p.id)    ?? 999,
    localSeed:   localSeedMap.get(p.id) ?? 999,
    participant: p,
    wins:        wins.get(p.id)   ?? 0,
    losses:      losses.get(p.id) ?? 0,
  }));

  return entries.sort((a, b) => a.rank - b.rank || a.localSeed - b.localSeed);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "5" → "5º/8º" when there are N tied players in a group */
function rankLabel(rank: number, groupSize: number): string {
  if (groupSize <= 1) return `${rank}º`;
  return `${rank}º/${rank + groupSize - 1}º`;
}

// ─── Top-3 row card ───────────────────────────────────────────────────────────

const RANK_CFG = {
  1: {
    label:       "Campeón",
    emoji:       "🥇",
    glow:        "shadow-[0_0_40px_0_rgba(234,179,8,0.22)]",
    border:      "border-yellow-500/40",
    bg:          "bg-gradient-to-r from-yellow-900/30 via-yellow-950/20 to-transparent",
    rankColor:   "text-yellow-400",
    nameColor:   "text-yellow-100",
    labelColor:  "text-yellow-500",
    rankBg:      "bg-yellow-500/15 border-yellow-500/30",
    barColor:    "bg-yellow-500",
  },
  2: {
    label:       "Subcampeón",
    emoji:       "🥈",
    glow:        "shadow-[0_0_24px_0_rgba(148,163,184,0.14)]",
    border:      "border-slate-400/30",
    bg:          "bg-gradient-to-r from-slate-700/25 via-slate-800/15 to-transparent",
    rankColor:   "text-slate-300",
    nameColor:   "text-slate-200",
    labelColor:  "text-slate-400",
    rankBg:      "bg-slate-500/15 border-slate-400/25",
    barColor:    "bg-slate-400",
  },
  3: {
    label:       "Tercer lugar",
    emoji:       "🥉",
    glow:        "shadow-[0_0_20px_0_rgba(180,83,9,0.14)]",
    border:      "border-amber-700/30",
    bg:          "bg-gradient-to-r from-amber-900/20 via-amber-950/12 to-transparent",
    rankColor:   "text-amber-500",
    nameColor:   "text-amber-200",
    labelColor:  "text-amber-600",
    rankBg:      "bg-amber-800/20 border-amber-700/25",
    barColor:    "bg-amber-600",
  },
} as const;

function TopEntry({ entry, tiedCount = 1 }: { entry: StandingEntry; tiedCount?: number }) {
  const cfg  = RANK_CFG[entry.rank as 1 | 2 | 3];
  const name = entry.participant.user?.name ?? entry.participant.team?.name ?? "—";

  return (
    <div className={clsx(
      "relative flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all",
      cfg.bg, cfg.border, cfg.glow
    )}>
      {/* Left accent bar */}
      <div className={clsx("absolute left-0 top-3 bottom-3 w-0.5 rounded-full", cfg.barColor)} />

      {/* Rank badge */}
      <div className={clsx(
        "shrink-0 w-10 h-10 rounded-xl border flex flex-col items-center justify-center gap-0",
        cfg.rankBg
      )}>
        <span className="text-base leading-none">{cfg.emoji}</span>
      </div>

      {/* Name + label */}
      <div className="flex-1 min-w-0">
        <p className={clsx("text-xs font-bold uppercase tracking-widest mb-0.5", cfg.labelColor)}>
          {tiedCount > 1 ? rankLabel(entry.rank, tiedCount) : cfg.label}
        </p>
        <p className={clsx("font-black leading-tight truncate",
          entry.rank === 1 ? "text-lg" : "text-base",
          cfg.nameColor
        )}>
          {name}
        </p>
      </div>

    </div>
  );
}

// ─── Regular row entry ────────────────────────────────────────────────────────

function RegularEntry({ entry, groupSize }: { entry: StandingEntry; groupSize: number }) {
  const name = entry.participant.user?.name ?? entry.participant.team?.name ?? "—";

  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-ink-800/40 transition-colors">
      {/* Rank */}
      <div className="w-14 shrink-0 text-right">
        <span className="text-sm font-black text-ink-500">
          {rankLabel(entry.rank, groupSize)}
        </span>
      </div>

      {/* Name */}
      <p className="flex-1 text-sm font-semibold text-ink-300 truncate">{name}</p>
    </div>
  );
}

// ─── StandingsView ────────────────────────────────────────────────────────────

interface StandingsViewProps {
  entries:    StandingEntry[];
  tournament: Tournament;
  levelName?: string | null;
}

export function StandingsView({ entries, tournament, levelName }: StandingsViewProps) {
  const formatLabel: Record<string, string> = {
    single_elimination: "Eliminación Simple",
    double_elimination: "Doble Eliminación",
    round_robin:        "Round Robin + K.O.",
  };

  // Group all entries by rank so we can show "5º/8º" labels and handle tied top-3
  const groups: { rank: number; entries: StandingEntry[] }[] = [];
  for (const e of entries) {
    const g = groups.find(g => g.rank === e.rank);
    if (g) g.entries.push(e);
    else groups.push({ rank: e.rank, entries: [e] });
  }

  const topGroups  = groups.filter(g => g.rank <= 3);
  const restGroups = groups.filter(g => g.rank > 3);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-yellow-900/20 via-transparent to-transparent
                        px-5 py-4 flex items-center gap-3 border-b border-ink-800">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20
                          flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-white font-black text-base leading-tight">
              {tournament.name}
              {levelName ? <span className="text-yellow-400"> · {levelName}</span> : null}
            </h2>
            <p className="text-ink-500 text-xs mt-0.5">
              {formatLabel[tournament.format] ?? tournament.format}
              {" · "}Clasificación final
            </p>
          </div>
        </div>

        {/* ── Top 3 (prominent rows) ── */}
        {topGroups.length > 0 && (
          <div className="p-4 space-y-2.5">
            {topGroups.map(({ rank, entries: grp }) =>
              grp.map((entry) => (
                <TopEntry
                  key={entry.participant.id}
                  entry={entry}
                  tiedCount={grp.length}
                />
              ))
            )}
          </div>
        )}

        {/* Divider between top 3 and rest */}
        {topGroups.length > 0 && restGroups.length > 0 && (
          <div className="flex items-center gap-3 px-5 pb-1">
            <div className="h-px flex-1 bg-ink-800" />
            <Medal className="w-3 h-3 text-ink-700" />
            <div className="h-px flex-1 bg-ink-800" />
          </div>
        )}

        {/* ── Rest of classification ── */}
        {restGroups.length > 0 && (
          <div className="divide-y divide-ink-800/50">
            {restGroups.map(({ rank, entries: grp }) => (
              <div key={rank}>
                {grp.map((entry) => (
                  <RegularEntry
                    key={entry.participant.id}
                    entry={entry}
                    groupSize={grp.length}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {entries.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 text-ink-600">
            <Trophy className="w-10 h-10 opacity-30" />
            <p className="text-sm">Sin resultados aún</p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-ink-800/60 flex items-center justify-between">
          <span className="text-[10px] text-ink-700 font-mono uppercase tracking-widest">
            Clasificación Final
          </span>
          <span className="text-[10px] text-ink-700 font-mono">
            {new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  );
}
