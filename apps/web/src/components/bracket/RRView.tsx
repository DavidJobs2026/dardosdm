"use client";

import { useEffect, useState, useCallback } from "react";
import { Tournament, Match, Participant, RRGroup, Diana } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import {
  CheckCircle, AlertTriangle, Zap, Trophy, RefreshCw,
  ChevronRight, ChevronDown, Target, Clock, Play, RotateCcw, X,
} from "lucide-react";
import { format as fmtDate } from "date-fns";
import { es } from "date-fns/locale";
import { TiebreakerResultModal } from "./TiebreakerResultModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pName(p?: Participant | null): string {
  return p?.user?.name ?? p?.team?.name ?? "—";
}
function pId(p?: Participant | null): string {
  return p?.id ?? "";
}
function fmtTime(iso?: string | null) {
  if (!iso) return null;
  return fmtDate(new Date(iso), "HH:mm", { locale: es });
}

// ─── Result cell for the cross-table ─────────────────────────────────────────

function CrossCell({
  rowId, colId, matches, canClick, onClickMatch,
}: {
  rowId: string; colId: string;
  matches: Match[];
  canClick: boolean;
  onClickMatch: (m: Match) => void;
}) {
  // Self cell — diagonal
  if (rowId === colId) {
    return (
      <td className="p-0">
        <div className="w-full h-full min-h-[3rem] flex items-center justify-center select-none">
          <svg width="28" height="28" viewBox="0 0 28 28" className="opacity-20">
            <line x1="4" y1="4" x2="24" y2="24" stroke="currentColor" strokeWidth="1.5" className="text-ink-400" />
            <line x1="24" y1="4" x2="4" y2="24" stroke="currentColor" strokeWidth="1.5" className="text-ink-400" />
          </svg>
        </div>
      </td>
    );
  }

  const match = matches.find(
    m => (pId(m.participant1) === rowId && pId(m.participant2) === colId) ||
         (pId(m.participant1) === colId && pId(m.participant2) === rowId)
  );

  if (!match) return <td className="p-0"><div className="min-h-[3rem]" /></td>;

  const isP1  = pId(match.participant1) === rowId;
  const done  = match.status === "completed";
  const isWin = done && match.winnerId === rowId;
  const s1    = done ? (isP1 ? (match.score1 ?? 0) : (match.score2 ?? 0)) : null;
  const s2    = done ? (isP1 ? (match.score2 ?? 0) : (match.score1 ?? 0)) : null;
  const clickable = canClick && match.status !== "bye";

  return (
    <td className="p-0">
      <button
        type="button"
        disabled={!clickable}
        onClick={() => clickable && onClickMatch(match)}
        className={clsx(
          "w-full min-h-[3rem] flex flex-col items-center justify-center gap-0.5 transition-all",
          done
            ? isWin
              ? "bg-green-900/25 hover:bg-green-900/35"
              : "bg-red-900/15 hover:bg-red-900/25"
            : "hover:bg-ink-700/40",
          clickable && !done && "cursor-pointer"
        )}
        title={clickable && !done ? "Registrar resultado" : undefined}
      >
        {done ? (
          <>
            <span className={clsx(
              "text-sm font-black leading-none",
              isWin ? "text-green-400" : "text-red-400"
            )}>
              {isWin ? "O" : "X"}
            </span>
            <span className={clsx(
              "text-[10px] tabular-nums font-semibold",
              isWin ? "text-green-300/70" : "text-red-300/50"
            )}>
              {s1}:{s2}
            </span>
          </>
        ) : (
          <span className="text-ink-700 text-xs">·</span>
        )}
      </button>
    </td>
  );
}

// ─── Compact match queue card ─────────────────────────────────────────────────

function MatchCard({
  match, idx, isOrganizer, reviewed, onAction,
}: {
  match: Match; idx: number;
  isOrganizer: boolean; reviewed: boolean;
  onAction: (m: Match) => void;
}) {
  const is3way = match.isTiebreaker && !!match.participant3;
  const p1 = pName(match.participant1);
  const p2 = pName(match.participant2);
  const p3 = is3way ? pName(match.participant3) : null;
  const done   = match.status === "completed";
  const called = !!match.launch1At;
  const callsN = [match.launch1At, match.launch2At, match.launch3At].filter(Boolean).length;
  const p1Won  = done && match.winnerId === match.participant1?.id;
  const p2Won  = done && match.winnerId === match.participant2?.id;

  return (
    <div className={clsx(
      "flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all",
      done    ? "bg-ink-800/30 border-ink-700/20"
      : called ? "bg-orange-900/10 border-orange-800/30"
      :          "bg-ink-800/50 border-ink-700/40",
      match.isTiebreaker && "ring-1 ring-amber-500/35"
    )}>
      {/* Number */}
      <span className="text-[10px] font-mono text-ink-600 shrink-0 w-3.5 text-right">{idx + 1}</span>

      {/* Status dot */}
      <span className={clsx(
        "w-1.5 h-1.5 rounded-full shrink-0",
        done ? "bg-green-500" : called ? "bg-orange-500 animate-pulse" : "bg-ink-700"
      )} />

      {/* Names */}
      {is3way ? (
        // 3-player tiebreaker: stack names vertically
        <div className="flex-1 min-w-0 text-xs space-y-0.5">
          {[
            { name: p1, won: p1Won },
            { name: p2, won: p2Won },
            { name: p3, won: false },
          ].map(({ name, won }, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[10px] text-ink-600 font-mono w-3 shrink-0">{i + 1}º</span>
              <span className={clsx(
                "font-semibold truncate",
                won ? "text-green-300" : done ? "text-ink-500" : "text-white"
              )} title={name ?? ""}>{name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1.5 min-w-0 text-xs">
          <span className={clsx(
            "font-semibold truncate",
            p1Won ? "text-green-300" : done ? "text-ink-500" : "text-white"
          )} title={p1}>{p1}</span>
          <span className="text-ink-700 shrink-0">vs</span>
          <span className={clsx(
            "font-semibold truncate",
            p2Won ? "text-green-300" : done ? "text-ink-500" : "text-white"
          )} title={p2}>{p2}</span>
        </div>
      )}

      {/* Call indicator */}
      {called && !done && (
        <span className="text-[10px] text-orange-400 shrink-0 flex items-center gap-1 whitespace-nowrap">
          <Clock className="w-2.5 h-2.5" />
          {callsN}ª · {fmtTime(match.launch3At ?? match.launch2At ?? match.launch1At)}
        </span>
      )}

      {/* Score or action */}
      {done ? (
        is3way ? (
          <span className="text-[10px] font-bold text-green-400 shrink-0 whitespace-nowrap">Resuelto ✓</span>
        ) : (
          <span className="text-xs font-bold text-ink-400 tabular-nums shrink-0">
            {match.score1}–{match.score2}
          </span>
        )
      ) : isOrganizer && !reviewed ? (
        <button
          type="button"
          onClick={() => onAction(match)}
          className={clsx(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0",
            called
              ? is3way
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-blue-700 hover:bg-blue-600 text-white"
              : "bg-orange-600 hover:bg-orange-500 text-white"
          )}
        >
          {called
            ? is3way
              ? <><Trophy className="w-3 h-3" /> Resultado</>
              : <><Target className="w-3 h-3" /> Resultado</>
            : <><Play className="w-3 h-3" /> Lanzar</>
          }
        </button>
      ) : null}
    </div>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group, tournamentId, bracketLevel, advancingCount, isOrganizer,
  dianas, groupDianasMap, otherLevelNums, onAssignDiana, onUnassignDiana,
  onDataChange, onMatchAction,
}: {
  group:          RRGroup & { matches: Match[] };
  tournamentId:   string;
  bracketLevel:   string | null;
  advancingCount: number;
  isOrganizer:    boolean;
  /** All tournament dianas */
  dianas:         Diana[];
  /** Map of all group-diana assignments for this level */
  groupDianasMap: Record<string, number[]>;
  /** Diana numbers reserved in OTHER bracket levels (cross-level exclusion) */
  otherLevelNums: Set<number>;
  onAssignDiana:   (groupName: string, num: number) => void;
  onUnassignDiana: (groupName: string, num: number) => void;
  onDataChange:   () => void;
  onMatchAction:  (m: Match) => void;
}) {
  const [approving,    setApproving]    = useState(false);
  const [unapproving,  setUnapproving]  = useState(false);
  const [creatingTie,  setCreatingTie]  = useState(false);
  const [resetting,    setResetting]    = useState(false);

  const participants = group.standings.map(s => s.participant).filter(Boolean) as Participant[];

  const queueMatches = [...group.matches]
    .filter(m => m.status !== "bye")
    .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position);

  // Guard: don't allow a second tiebreaker if one already exists for this group
  const tiebreakerExists = group.matches.some(m => m.isTiebreaker);

  const completedCount = queueMatches.filter(m => m.status === "completed").length;
  const totalCount     = queueMatches.length;

  // ── Group-diana assignment helpers ────────────────────────────────────────
  const assignedDianas = groupDianasMap[group.name] ?? [];
  // How many dianas this group can have: floor(players / 2) simultaneous matches
  const maxGroupDianas = Math.floor(participants.length / 2);
  // Numbers already taken by other groups in this same level
  const otherGroupNums = new Set<number>(
    Object.entries(groupDianasMap)
      .filter(([name]) => name !== group.name)
      .flatMap(([, nums]) => nums)
  );
  // Free dianas: not in use, not broken, not reserved by any other group (any level)
  const freeDianas = dianas.filter(
    d => !d.matchId && !d.broken && !otherGroupNums.has(d.number) && !otherLevelNums.has(d.number)
  );
  // Free dianas available to add (not already in this group)
  const addableDianas = freeDianas.filter(d => !assignedDianas.includes(d.number));

  // Shared level payload — passed to every group endpoint so multi-level works correctly
  const levelPayload = bracketLevel != null ? { bracketLevel } : {};

  const handleApprove = async () => {
    if (!window.confirm(`¿Aprobar todos los resultados del Grupo ${group.name}? Los resultados quedarán bloqueados.`)) return;
    setApproving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/approve-group`, { group: group.name, ...levelPayload });
      toast.success(`Grupo ${group.name} aprobado`);
      onDataChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al aprobar");
    } finally { setApproving(false); }
  };

  const handleUnapprove = async () => {
    if (!window.confirm(
      `¿Desbloquear el Grupo ${group.name} para editar resultados? Se podrán modificar los resultados y tendrás que volver a aprobarlo.`
    )) return;
    setUnapproving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/unapprove-group`, { group: group.name, ...levelPayload });
      toast.success(`Grupo ${group.name} desbloqueado`);
      onDataChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al desbloquear");
    } finally { setUnapproving(false); }
  };

  const handleCreateTiebreaker = async () => {
    const ids = group.standings.filter(s => s.needsTiebreaker).map(s => s.participantId);
    if (ids.length < 2) return;
    setCreatingTie(true);
    try {
      await api.post(`/tournaments/${tournamentId}/create-tiebreaker`, { participantIds: ids, group: group.name, ...levelPayload });
      toast.success("Partido de desempate creado");
      onDataChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al crear desempate");
    } finally { setCreatingTie(false); }
  };

  const handleResetGroup = async () => {
    if (!window.confirm(
      `¿Reiniciar el Grupo ${group.name}? Se eliminarán todos sus partidos y resultados, y se regenerará el cuadrante con los mismos jugadores.`
    )) return;
    setResetting(true);
    try {
      await api.post(`/tournaments/${tournamentId}/reset-rr-group`, { group: group.name, ...levelPayload });
      toast.success(`Grupo ${group.name} reiniciado`);
      onDataChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al reiniciar el grupo");
    } finally { setResetting(false); }
  };

  const canClick = isOrganizer && !group.reviewed;

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-ink-800 bg-gradient-to-r from-violet-900/15 to-transparent">
        {/* Group identity */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-violet-600/25 border border-violet-500/30 flex items-center justify-center text-violet-300 font-black text-base shrink-0">
            {group.name}
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">Grupo {group.name}</h3>
            <p className="text-[11px] text-ink-500">
              {participants.length} jugadores · {completedCount}/{totalCount} partidos completados
            </p>
          </div>
        </div>

        {/* Diana assignment (organizer only) */}
        {isOrganizer && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Target className="w-3 h-3 text-ink-500 shrink-0" />
            {assignedDianas.map(num => (
              <span key={num}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-900/30 border border-orange-700/40 text-orange-300 text-[11px] font-bold">
                {num}
                <button
                  type="button"
                  onClick={() => onUnassignDiana(group.name, num)}
                  className="hover:text-white transition-colors ml-0.5"
                  title="Quitar diana del grupo"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {assignedDianas.length < maxGroupDianas && (
              addableDianas.length > 0 ? (
                <select
                  value=""
                  onChange={e => { if (e.target.value) onAssignDiana(group.name, Number(e.target.value)); }}
                  className="h-6 px-1.5 rounded-md bg-[#1a1a1a] border border-[#333] text-orange-300 text-[11px] focus:outline-none focus:border-orange-600 cursor-pointer"
                  title="Asignar diana a este grupo"
                >
                  <option value="" disabled>+ Diana</option>
                  {addableDianas.map(d => (
                    <option key={d.number} value={d.number}>Diana {d.number}</option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] text-ink-600 italic">Sin dianas libres</span>
              )
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Reset group button — only shown to organizers on non-reviewed groups */}
          {isOrganizer && !group.reviewed && (
            <button
              type="button"
              onClick={handleResetGroup}
              disabled={resetting}
              title={`Reiniciar Grupo ${group.name}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-400 bg-ink-800 hover:bg-red-900/30 hover:text-red-400 border border-ink-700 hover:border-red-800/50 disabled:opacity-40 px-2.5 py-1.5 rounded-lg transition-all"
            >
              <RotateCcw className={clsx("w-3 h-3", resetting && "animate-spin")} />
              {resetting ? "Reiniciando…" : "Reiniciar"}
            </button>
          )}

          {group.reviewed ? (
            <>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400 bg-green-900/20 border border-green-800/30 px-3 py-1.5 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" /> Aprobado
              </span>
              {isOrganizer && (
                <button
                  type="button"
                  onClick={handleUnapprove}
                  disabled={unapproving}
                  title="Desbloquear para corregir resultados"
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-400 bg-ink-800 hover:bg-amber-900/30 hover:text-amber-400 border border-ink-700 hover:border-amber-800/50 disabled:opacity-40 px-2.5 py-1.5 rounded-lg transition-all"
                >
                  <RotateCcw className={clsx("w-3 h-3", unapproving && "animate-spin")} />
                  {unapproving ? "Desbloqueando…" : "Editar resultados"}
                </button>
              )}
            </>
          ) : group.allMatchesDone && isOrganizer ? (
            <button type="button" onClick={handleApprove} disabled={approving}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-700 hover:bg-green-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-all">
              {approving
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Aprobando…</>
                : <><CheckCircle className="w-3.5 h-3.5" /> Aprobar resultados</>}
            </button>
          ) : (
            <span className="text-[11px] text-ink-600 bg-ink-800 border border-ink-700 px-2.5 py-1 rounded-lg tabular-nums">
              {totalCount - completedCount} pendientes
            </span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* ── Unified cross-table + standings ── */}
        <div className="overflow-x-auto rounded-xl border border-ink-800">
          <table className="w-full border-collapse text-xs" style={{ minWidth: `${180 + participants.length * 52 + 180}px` }}>
            <thead>
              <tr className="border-b border-ink-700/60 bg-ink-800/50">
                <th className="px-3 py-2 text-left w-8 text-ink-600 font-semibold">#</th>
                <th className="px-3 py-2 text-left text-ink-500 font-semibold uppercase tracking-wider text-[10px]">Jugador</th>
                {participants.map((_, i) => (
                  <th key={i} className="text-center py-2 text-ink-500 font-bold w-14">
                    <span className="w-5 h-5 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center text-[10px] text-ink-400 mx-auto tabular-nums">
                      {i + 1}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-[10px] text-ink-500 font-semibold uppercase tracking-wider w-10">V</th>
                <th className="px-2 py-2 text-center text-[10px] text-ink-500 font-semibold uppercase tracking-wider w-10">D</th>
                <th className="px-2 py-2 text-center text-[10px] text-ink-500 font-semibold uppercase tracking-wider w-12">±</th>
                <th className="px-3 py-2 text-center text-[10px] text-ink-500 font-semibold uppercase tracking-wider w-12">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {group.standings.map((s, rowIdx) => {
                const p       = s.participant;
                const advances = rowIdx < advancingCount;
                const isTied   = s.needsTiebreaker;

                return (
                  <tr key={s.participantId} className={clsx(
                    "border-b border-ink-800/50 transition-colors",
                    advances ? "bg-green-900/8" : "",
                    rowIdx === advancingCount - 1 && "border-b-2 border-b-green-800/40",
                    isTied && "bg-amber-900/5"
                  )}>
                    {/* Player number */}
                    <td className="px-3 py-0">
                      <span className={clsx(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                        advances ? "bg-green-600 text-white" : "bg-ink-700 text-ink-500"
                      )}>
                        {rowIdx + 1}
                      </span>
                    </td>

                    {/* Player name */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          "font-semibold text-sm",
                          advances ? "text-white" : "text-ink-300"
                        )}>
                          {pName(p)}
                        </span>
                        {isTied && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
                      </div>
                    </td>

                    {/* Result cells — one per opponent */}
                    {participants.map(colP => (
                      <CrossCell
                        key={colP.id}
                        rowId={s.participantId}
                        colId={colP.id}
                        matches={group.matches}
                        canClick={canClick}
                        onClickMatch={onMatchAction}
                      />
                    ))}

                    {/* Wins */}
                    <td className="px-2 py-3 text-center">
                      <span className={clsx(
                        "font-bold tabular-nums",
                        s.wins > 0 ? "text-green-400" : "text-ink-600"
                      )}>{s.wins}</span>
                    </td>

                    {/* Losses */}
                    <td className="px-2 py-3 text-center">
                      <span className={clsx(
                        "font-bold tabular-nums",
                        s.losses > 0 ? "text-red-400/80" : "text-ink-600"
                      )}>{s.losses}</span>
                    </td>

                    {/* Set diff */}
                    <td className="px-2 py-3 text-center">
                      <span className={clsx(
                        "font-bold tabular-nums",
                        s.setDiff > 0 ? "text-green-400" : s.setDiff < 0 ? "text-red-400" : "text-ink-500"
                      )}>
                        {s.setDiff > 0 ? "+" : ""}{s.setDiff}
                      </span>
                    </td>

                    {/* Position badge */}
                    <td className="px-3 py-3 text-center">
                      {advances ? (
                        <span className={clsx(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-black mx-auto",
                          rowIdx === 0 ? "bg-yellow-500 text-black" : "bg-green-600 text-white"
                        )}>
                          {s.rank}
                        </span>
                      ) : (
                        <span className="text-ink-600 tabular-nums">{s.rank}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Tiebreaker alert ── */}
        {group.hasTiebreaker && !group.reviewed && isOrganizer && (
          <div className="px-3 py-2.5 bg-amber-900/15 border border-amber-800/30 rounded-xl flex items-center gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="flex-1 text-xs text-amber-300">
              {tiebreakerExists
                ? "Partido de desempate creado — introduce el resultado para resolver el empate"
                : "Empate no resoluble automáticamente — crea un partido de desempate"}
            </p>
            {!tiebreakerExists && (
              <button type="button" onClick={handleCreateTiebreaker} disabled={creatingTie}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all disabled:opacity-50 shrink-0">
                {creatingTie ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Crear desempate
              </button>
            )}
          </div>
        )}

        {/* ── Match queue grid ── */}
        <div>
          <p className="text-[10px] font-bold text-ink-600 uppercase tracking-widest mb-2">Orden de partidos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {queueMatches.map((m, i) => (
              <MatchCard
                key={m.id}
                match={m}
                idx={i}
                isOrganizer={isOrganizer}
                reviewed={group.reviewed}
                onAction={onMatchAction}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main RRView ──────────────────────────────────────────────────────────────

interface Props {
  tournament:    Tournament;
  matches:       Match[];
  participants:  Participant[];
  isOrganizer:   boolean;
  hasKO?:        boolean;         // true once the KO bracket has been generated
  bracketLevel?: string | null;   // null = no level; string = multi-level
  onReport:      (m: Match) => void;
  onDataChange:  () => void;
}

// ─── localStorage key helpers ─────────────────────────────────────────────────

function lsKey(tournamentId: string, bracketLevel?: string | null) {
  // Include level in key so each level has its own independent diana assignments
  const lvl = bracketLevel ?? "default";
  return `rrGroupDianas:${tournamentId}:${lvl}`;
}
function readGroupDianas(tournamentId: string, bracketLevel?: string | null): Record<string, number[]> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(lsKey(tournamentId, bracketLevel)) : null;
    return raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
  } catch { return {}; }
}
function writeGroupDianas(tournamentId: string, bracketLevel: string | null | undefined, map: Record<string, number[]>) {
  try { localStorage.setItem(lsKey(tournamentId, bracketLevel), JSON.stringify(map)); } catch { /* noop */ }
}

/** Returns a Set of all diana numbers reserved by ANY group in OTHER levels of this tournament */
function readOtherLevelsDianas(tournamentId: string, currentLevel?: string | null): Set<number> {
  const result = new Set<number>();
  try {
    if (typeof window === "undefined") return result;
    const prefix     = `rrGroupDianas:${tournamentId}:`;
    const currentKey = lsKey(tournamentId, currentLevel);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key !== currentKey) {
        const map = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number[]>;
        Object.values(map).flat().forEach(n => result.add(n));
      }
    }
  } catch { /* noop */ }
  return result;
}

export function RRView({ tournament, matches, isOrganizer, hasKO = false, bracketLevel, onReport, onDataChange }: Props) {
  const [groups,           setGroups]           = useState<(RRGroup & { matches: Match[] })[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [launchingKO,      setLaunchingKO]      = useState(false);
  const [tiebreakerMatch,  setTiebreakerMatch]  = useState<Match | null>(null);
  // Auto-collapse the RR section once the KO bracket is live so it doesn't
  // dominate the screen, but the user can always expand it again.
  const [collapsed,        setCollapsed]        = useState(hasKO);

  // ── Group-diana state ──────────────────────────────────────────────────────
  const [dianas,         setDianas]         = useState<Diana[]>([]);
  const [groupDianasMap, setGroupDianasMap] = useState<Record<string, number[]>>(
    () => readGroupDianas(tournament.id, bracketLevel)
  );

  // Re-load diana assignments when the bracket level changes (user switches level tab)
  useEffect(() => {
    setGroupDianasMap(readGroupDianas(tournament.id, bracketLevel));
  }, [tournament.id, bracketLevel]);

  const loadDianas = useCallback(async () => {
    try {
      const res = await api.get(`/tournaments/${tournament.id}/dianas`);
      setDianas(res.data.data ?? []);
    } catch { /* silent */ }
  }, [tournament.id]);

  useEffect(() => { loadDianas(); }, [loadDianas]);

  const handleAssignDiana = (groupName: string, num: number) => {
    setGroupDianasMap(prev => {
      const next = { ...prev, [groupName]: [...(prev[groupName] ?? []), num] };
      writeGroupDianas(tournament.id, bracketLevel, next);
      return next;
    });
  };

  const handleUnassignDiana = (groupName: string, num: number) => {
    setGroupDianasMap(prev => {
      const next = { ...prev, [groupName]: (prev[groupName] ?? []).filter(n => n !== num) };
      writeGroupDianas(tournament.id, bracketLevel, next);
      return next;
    });
  };

  const advancingCount = tournament.rrAdvancingTeams ?? 2;

  const loadStandings = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (bracketLevel != null) params.level = bracketLevel;
      const res = await api.get(`/tournaments/${tournament.id}/rr-standings`, { params });
      setGroups(res.data.data.groups ?? []);
    } catch {
      toast.error("Error al cargar clasificaciones");
    } finally {
      setLoading(false);
    }
  }, [tournament.id, bracketLevel]);

  useEffect(() => { loadStandings(); }, [loadStandings]);

  const completedCount = matches.filter(m => m.status === "completed").length;
  const calledCount    = matches.filter(m => !!m.launch1At).length;
  // Build a stable key from every completed match's result so that editing
  // an already-completed match (swapping 2-0 → 0-2, same sum but different
  // winner) still triggers a standings reload.
  const resultsKey = matches
    .filter(m => m.status === "completed")
    .map(m => `${m.id}:${m.score1 ?? ""}:${m.score2 ?? ""}:${m.winnerId ?? ""}`)
    .sort()
    .join("|");
  useEffect(() => { loadStandings(); }, [completedCount, calledCount, resultsKey, loadStandings]);

  const allGroupsReviewed = groups.length > 0 && groups.every(g => g.reviewed);

  const handleLaunchKO = async () => {
    if (!window.confirm("¿Lanzar el cuadro KO? Se generará el bracket de eliminación directa con los clasificados.")) return;
    setLaunchingKO(true);
    try {
      const payload = bracketLevel != null ? { bracketLevel } : {};
      await api.post(`/tournaments/${tournament.id}/launch-ko`, payload);
      toast.success("¡Cuadro KO generado!");
      onDataChange();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al lanzar el KO");
    } finally { setLaunchingKO(false); }
  };

  // Only show full-page spinner on initial load (no groups yet).
  // Silent background refreshes keep the content mounted so the scroll
  // position is never reset.
  if (loading && groups.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-ink-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 group"
        >
          <span className="w-5 h-5 rounded bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-violet-300 text-[10px] font-black">RR</span>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Fase de grupos</h2>
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-ink-500 group-hover:text-white transition-colors" />
            : <ChevronDown  className="w-3.5 h-3.5 text-ink-500 group-hover:text-white transition-colors" />
          }
        </button>
        {!collapsed && (
          <button type="button" onClick={loadStandings} disabled={loading}
            className="text-ink-600 hover:text-ink-300 transition-colors p-1.5 rounded-lg hover:bg-ink-800" title="Actualizar">
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        )}
      </div>

      {/* Collapsible body */}
      {!collapsed && <>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl text-center py-12 text-ink-600 text-sm">
          No hay grupos generados aún
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <GroupCard
              key={group.name}
              group={group}
              tournamentId={tournament.id}
              bracketLevel={bracketLevel ?? null}
              advancingCount={advancingCount}
              isOrganizer={isOrganizer}
              dianas={dianas}
              groupDianasMap={groupDianasMap}
              otherLevelNums={readOtherLevelsDianas(tournament.id, bracketLevel)}
              onAssignDiana={handleAssignDiana}
              onUnassignDiana={handleUnassignDiana}
              onDataChange={() => { loadStandings(); loadDianas(); onDataChange(); }}
              onMatchAction={(m) => {
                if (m.isTiebreaker && m.participant3) {
                  // 3-player tiebreaker: launch first, then result
                  if (m.launch1At) {
                    setTiebreakerMatch(m);  // already called → enter ranking
                  } else {
                    onReport(m);            // not yet called → assign diana + launch
                  }
                } else {
                  onReport(m);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Launch KO banner */}
      {allGroupsReviewed && isOrganizer && (
        <div className="bg-gradient-to-r from-orange-900/30 to-transparent border border-orange-800/50 rounded-2xl p-5 flex items-center gap-4">
          <Trophy className="w-8 h-8 text-orange-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Todos los grupos están aprobados</p>
            <p className="text-xs text-ink-400 mt-0.5">
              {groups.length * advancingCount} clasificados · cruces cruzados entre grupos
            </p>
          </div>
          <button type="button" onClick={handleLaunchKO} disabled={launchingKO}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all disabled:opacity-50 shrink-0">
            {launchingKO
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generando…</>
              : <><ChevronRight className="w-4 h-4" /> Lanzar KO</>}
          </button>
        </div>
      )}

      </> /* end collapsible body */}

      {/* 3-player tiebreaker result modal — always mounted regardless of collapsed state */}
      {tiebreakerMatch && (
        <TiebreakerResultModal
          match={tiebreakerMatch}
          tournamentId={tournament.id}
          onClose={() => setTiebreakerMatch(null)}
          onSuccess={() => { loadStandings(); onDataChange(); }}
        />
      )}
    </div>
  );
}
