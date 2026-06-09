"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { Match, Diana, Tournament, Participant } from "@tournament/types";
import { clsx } from "clsx";
import {
  Target, Play, AlertTriangle, X, Clock, Check,
  Plus, RefreshCw, ChevronDown, Unlock, LayoutGrid,
  Wrench, Trash2, CheckSquare, Volume2, VolumeX,
} from "lucide-react";
import toast from "react-hot-toast";
import { ReportResultModal } from "@/components/bracket/ReportResultModal";
import { DianaFloorPlanEditor } from "./DianaFloorPlanEditor";
import { format as fmtDate } from "date-fns";
import { es } from "date-fns/locale";
import { announceMatch, announceWarning, announceEliminated } from "@/lib/tts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerName(p?: Participant | null) {
  return p?.user?.name ?? p?.team?.name ?? "TBD";
}

function fmtTime(iso?: string | null) {
  if (!iso) return null;
  return fmtDate(new Date(iso), "HH:mm:ss", { locale: es });
}

function secondsLeft(lastCall: string | null | undefined, cooldownMs = 5 * 60 * 1000) {
  if (!lastCall) return 0;
  const elapsed = Date.now() - new Date(lastCall).getTime();
  return Math.max(0, Math.ceil((cooldownMs - elapsed) / 1000));
}

// ─── No-show modal ────────────────────────────────────────────────────────────

interface NoShowModalProps {
  match: Match;
  onClose: () => void;
  onConfirm: (noShowPlayerId: string) => Promise<void>;
}

function NoShowModal({ match, onClose, onConfirm }: NoShowModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const p1 = match.participant1;
  const p2 = match.participant2;

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onConfirm(selected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            No presentado
          </h2>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-[#888]">Selecciona el jugador que <strong className="text-amber-400">NO se ha presentado</strong>:</p>

        <div className="space-y-2">
          {[p1, p2].filter(Boolean).map(p => (
            <button
              key={p!.id}
              onClick={() => setSelected(p!.id)}
              className={clsx(
                "w-full text-left px-4 py-3 rounded-xl border transition-all text-sm",
                selected === p!.id
                  ? "border-amber-500 bg-amber-500/10 text-amber-300 font-semibold"
                  : "border-[#333] bg-[#222] text-[#bbb] hover:border-[#555]"
              )}
            >
              {playerName(p)}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-[#333] text-[#888] text-sm hover:text-white transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold
                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando…" : "Confirmar no presentado"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Call-player selector modal (2nd / 3rd warning) ──────────────────────────

interface CallPlayerModalProps {
  match:     Match;
  callNum:   2 | 3;
  onClose:   () => void;
  onConfirm: (playerName: string) => void;
}

function CallPlayerModal({ match, callNum, onClose, onConfirm }: CallPlayerModalProps) {
  const label = callNum === 2 ? "Segundo aviso" : "Tercer aviso";
  const p1    = match.participant1;
  const p2    = match.participant2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Play className="w-4 h-4 text-amber-400" />
            {label}
          </h2>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-[#888]">
          ¿A qué jugador se le da el <strong className="text-amber-400">{label.toLowerCase()}</strong>?
        </p>

        <div className="space-y-2">
          {[p1, p2].filter(Boolean).map(p => (
            <button
              key={p!.id}
              onClick={() => onConfirm(playerName(p))}
              className="w-full text-left px-4 py-3 rounded-xl border border-[#333] bg-[#222]
                         text-white text-sm font-semibold hover:border-amber-500/60
                         hover:bg-amber-500/10 transition-all"
            >
              {playerName(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── localStorage helper (mirrors the key used in RRView) ─────────────────────

function readGroupDianasForMatch(tournamentId: string, match: Match): number[] {
  if (!match.rrGroup) return [];
  try {
    const lvl = match.bracketLevel ?? "default";
    const raw = typeof window !== "undefined"
      ? localStorage.getItem(`rrGroupDianas:${tournamentId}:${lvl}`)
      : null;
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, number[]>;
    return map[match.rrGroup] ?? [];
  } catch { return []; }
}

// ─── Match card in the queue ──────────────────────────────────────────────────

interface MatchRowProps {
  match: Match;
  dianas: Diana[];
  tournament: Tournament;
  onDataChange: () => void;
  onReport: (m: Match) => void;
  overdue?: boolean;
  skipLocalTTS?: boolean;
}

function MatchRow({ match, dianas, tournament, onDataChange, onReport, overdue, skipLocalTTS }: MatchRowProps) {
  const [launching, setLaunching]         = useState(false);
  const [noShowOpen, setNoShowOpen]       = useState(false);
  const [callPlayerOpen, setCallPlayerOpen] = useState(false);
  const [countdown, setCountdown]         = useState(0);
  const [showSelect, setShowSelect]       = useState(false);

  // Dianas free for this match in general
  let availableDianas = dianas.filter(d => !d.matchId || d.matchId === match.id);
  // If this match belongs to an RR group with pre-assigned dianas, restrict to those
  const groupDianas = readGroupDianasForMatch(tournament.id, match);
  if (groupDianas.length > 0) {
    availableDianas = availableDianas.filter(d => groupDianas.includes(d.number));
  }
  const assignedDiana = dianas.find(d => d.matchId === match.id);

  // Determine which call is next
  const callsDone = [match.launch1At, match.launch2At, match.launch3At].filter(Boolean).length;
  const lastCall  = match.launch3At ?? match.launch2At ?? match.launch1At;
  const secs      = secondsLeft(lastCall);

  // Live countdown
  useEffect(() => {
    if (secs <= 0) { setCountdown(0); return; }
    setCountdown(secs);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secs]);

  const canLaunch   = !!assignedDiana && callsDone < 3 && countdown === 0;
  const canNoShow   = callsDone >= 1 && countdown === 0 && match.status !== "completed";
  const canReport   = !!match.participant1 && !!match.participant2;

  const handleAssign = async (num: number) => {
    try {
      await api.post(`/tournaments/${tournament.id}/matches/${match.id}/assign-diana`, { dianaNumber: num });
      setShowSelect(false);
      onDataChange();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleUnassign = async () => {
    try {
      await api.delete(`/tournaments/${tournament.id}/matches/${match.id}/diana`);
      onDataChange();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  // 1st call → announce both players + diana.
  // 2nd / 3rd → open player-selector modal first; TTS fires after selection.
  const handleLaunch = () => {
    if (callsDone >= 1) {
      setCallPlayerOpen(true); // show player selector for 2nd / 3rd call
    } else {
      void doLaunch(null); // 1st call: no player selection needed
    }
  };

  const doLaunch = async (selectedPlayer: string | null) => {
    const callNum = callsDone + 1; // capture before API updates state
    setCallPlayerOpen(false);
    setLaunching(true);
    try {
      const res = await api.post(`/tournaments/${tournament.id}/matches/${match.id}/launch`);
      toast.success(res.data?.message ?? "Llamada registrada");
      onDataChange();
      if (assignedDiana && !skipLocalTTS) {
        if (callNum === 1) {
          void announceMatch(
            playerName(match.participant1),
            playerName(match.participant2),
            assignedDiana.number,
            match.participant3 ? playerName(match.participant3) : undefined,
          );
        } else {
          void announceWarning(
            selectedPlayer ?? "",
            assignedDiana.number,
            callNum as 2 | 3,
          );
        }
      }
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
    finally { setLaunching(false); }
  };

  const handleNoShow = async (noShowPlayerId: string) => {
    const noShowParticipant = [match.participant1, match.participant2]
      .find(p => p?.id === noShowPlayerId);
    const noShowName = playerName(noShowParticipant);
    try {
      await api.post(`/tournaments/${tournament.id}/matches/${match.id}/no-show`, { noShowPlayerId });
      toast.success("No presentado registrado");
      setNoShowOpen(false);
      onDataChange();
      void announceEliminated(noShowName);
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const callLabel = ["Primera", "Segunda", "Tercera"][callsDone] ?? "";

  return (
    <>
      {noShowOpen && (
        <NoShowModal match={match} onClose={() => setNoShowOpen(false)} onConfirm={handleNoShow} />
      )}
      {callPlayerOpen && (
        <CallPlayerModal
          match={match}
          callNum={callsDone === 1 ? 2 : 3}
          onClose={() => setCallPlayerOpen(false)}
          onConfirm={name => void doLaunch(name)}
        />
      )}

      {/* No-show → red border; overdue → amber pulsing border */}
      <div className={clsx(
        "bg-[#1e1e1e] rounded-xl px-4 py-3 space-y-2.5 border",
        match.noShowAt
          ? "border-red-800/60 border-l-4 border-l-red-600"
          : overdue
          ? "border-amber-500/70 border-l-4 border-l-amber-500 animate-pulse"
          : "border-[#2a2a2a]"
      )}>
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          {match.rrGroup && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-300 border border-violet-800/40 uppercase tracking-wider">
              Grupo {match.rrGroup}
            </span>
          )}
          {match.reviewed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-800/30 uppercase tracking-wider">
              ✓
            </span>
          )}
          {match.isTiebreaker && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/40 uppercase tracking-wider">
              Desempate
            </span>
          )}
          {match.bracketLevel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/40 uppercase tracking-wider">
              {match.bracketLevel}
            </span>
          )}
          {match.bracketSide && (
            <span className={clsx(
              "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
              match.bracketSide === "winners"
                ? "bg-emerald-900/40 text-emerald-300 border border-emerald-800/40"
                : "bg-orange-900/40 text-orange-300 border border-orange-800/40"
            )}>
              {match.bracketSide === "winners" ? "Ganadores" : "Perdedores"}
            </span>
          )}
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-ink-800 text-ink-400 border border-ink-700">
            R{match.round}
          </span>
          {/* Player names — no-show player gets red strikethrough */}
          {(() => {
            const noShowId = match.noShowAt
              ? (match.participant1?.id === match.winnerId
                  ? match.participant2?.id
                  : match.participant1?.id)
              : null;
            return (
              <span className="flex-1 text-sm font-semibold text-white flex items-center gap-1.5 flex-wrap min-w-0">
                <span className={clsx(
                  noShowId === match.participant1?.id &&
                  "line-through decoration-red-500 decoration-2 text-red-400"
                )}>
                  {playerName(match.participant1)}
                </span>
                <span className="text-[#555] font-normal text-xs">vs</span>
                <span className={clsx(
                  noShowId === match.participant2?.id &&
                  "line-through decoration-red-500 decoration-2 text-red-400"
                )}>
                  {playerName(match.participant2)}
                </span>
              </span>
            );
          })()}
          {match.status === "completed" && (
            match.noShowAt ? (
              <span className="text-[10px] text-red-400 font-bold flex items-center gap-1 shrink-0">
                <AlertTriangle className="w-3 h-3" /> No presentado
              </span>
            ) : (
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                <Check className="w-3 h-3" /> Completado
              </span>
            )
          )}
        </div>

        {/* Launch times — always shown when there's any call or a no-show */}
        {(callsDone > 0 || match.noShowAt) && (
          <div className="flex flex-wrap gap-3 text-[11px] text-[#666]">
            {/* Diana badge — shown alongside call times so it's always visible */}
            {assignedDiana && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-900/30 border border-red-700/40 text-red-300 font-bold">
                <Target className="w-3 h-3" /> Diana {assignedDiana.number}
              </span>
            )}
            {match.launch1At && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 1ª {fmtTime(match.launch1At)}</span>}
            {match.launch2At && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 2ª {fmtTime(match.launch2At)}</span>}
            {match.launch3At && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 3ª {fmtTime(match.launch3At)}</span>}
            {match.noShowAt  && (
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <AlertTriangle className="w-3 h-3" /> No presentado {fmtTime(match.noShowAt)}
              </span>
            )}
          </div>
        )}

        {/* Actions row */}
        {match.status !== "completed" && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Diana selector */}
            <div className="relative">
              {assignedDiana ? (
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-900/30 border border-red-700/40 text-red-300 text-xs font-bold">
                    <Target className="w-3.5 h-3.5" /> Diana {assignedDiana.number}
                  </span>
                  <button
                    onClick={handleUnassign}
                    className="p-1.5 rounded-lg hover:bg-[#333] text-[#555] hover:text-[#999] transition-colors"
                    title="Liberar diana"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {availableDianas.length === 0 ? (
                    <span className="text-xs text-[#555]">Sin dianas libres</span>
                  ) : (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) handleAssign(Number(e.target.value)); }}
                      className="h-7 px-2 rounded-lg bg-[#252525] border border-[#333] text-white text-xs focus:outline-none focus:border-green-600 cursor-pointer"
                    >
                      <option value="" disabled>Nº diana</option>
                      {availableDianas.map(d => (
                        <option key={d.id} value={d.number}>Diana {d.number}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Launch button */}
            {callsDone < 3 && (
              <button
                onClick={handleLaunch}
                disabled={!canLaunch || launching}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  canLaunch
                    ? "bg-emerald-700 hover:bg-emerald-600 text-white"
                    : "bg-[#252525] border border-[#333] text-[#555] cursor-not-allowed"
                )}
                title={!assignedDiana ? "Asigna una diana primero" : countdown > 0 ? `Espera ${countdown}s` : `${callLabel} llamada`}
              >
                {launching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {callsDone === 0 ? "Lanzar" : `${callLabel} llamada`}
                {countdown > 0 && <span className="text-[10px] font-normal opacity-70">({countdown}s)</span>}
              </button>
            )}

            {/* No-show button */}
            {canNoShow && (
              <button
                onClick={() => setNoShowOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                           bg-amber-900/30 border border-amber-700/40 text-amber-400 hover:bg-amber-800/40 transition-colors"
                title={countdown > 0 ? `Espera ${countdown}s` : "Registrar no presentado"}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                No presentado
              </button>
            )}

            {/* Report result */}
            {canReport && (
              <button
                onClick={() => onReport(match)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                           bg-amber-500/10 border border-amber-700/40 text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Resultado
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Diana grid (spatial + fallback) ─────────────────────────────────────────

const MINI_CELL = 40; // px — compact spatial view

interface DianaGridProps {
  dianas:            Diana[];
  onClickDiana:      (d: Diana) => void;
  selectMode?:       boolean;
  selectedIds?:      Set<string>;
  /** Diana numbers assigned to any RR group (reserved but not yet in use) */
  groupAssignedNums?: Set<number>;
  /** Map of diana number → "Grupo X · Nivel Y" label */
  groupAssignedInfo?: Map<number, string>;
}

function DianaGrid({ dianas, onClickDiana, selectMode, selectedIds, groupAssignedNums, groupAssignedInfo }: DianaGridProps) {
  // Check if any dianas have positions
  const hasPositions = dianas.some(d => d.posX != null);

  if (!hasPositions) {
    // Fallback: scrollable grid — cap at ~280px so 200 dianas don't overflow
    return (
      <div
        style={{
          maxHeight: 288,
          overflowY: 'scroll',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
      <div className="flex flex-wrap gap-2">
        {dianas.map(d => {
          const occupied  = !!d.matchId;
          const broken    = !!d.broken;
          const groupRes  = !occupied && !broken && !!groupAssignedNums?.has(d.number);
          const isSel     = selectMode && selectedIds?.has(d.id);
          return (
            <button
              key={d.id}
              onClick={() => onClickDiana(d)}
              className={clsx(
                "w-12 h-12 rounded-xl font-bold text-sm transition-all border-2 relative",
                isSel
                  ? "bg-blue-900/50 border-blue-400 text-blue-200 scale-95 ring-2 ring-blue-400/50"
                  : occupied
                  ? "bg-red-900/40 border-red-600/60 text-red-300 hover:bg-red-800/50 shadow-[0_0_8px_0_rgba(239,68,68,0.3)]"
                  : broken
                  ? "bg-amber-900/40 border-amber-600/60 text-amber-300 hover:bg-amber-800/50"
                  : groupRes
                  ? "bg-orange-900/40 border-orange-600/60 text-orange-300 hover:bg-orange-800/50"
                  : "bg-green-900/30 border-green-700/40 text-green-400 hover:bg-green-800/40"
              )}
              title={
                occupied  ? `Diana ${d.number} — En uso` :
                broken    ? `Diana ${d.number} — Averiada` :
                groupRes  ? `Diana ${d.number} — Reservada · ${groupAssignedInfo?.get(d.number) ?? "grupo RR"}` :
                            `Diana ${d.number} — Libre`
              }
            >
              {d.number}
              {isSel && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-400 border border-[#1a1a1a] flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </span>
              )}
              {!isSel && occupied && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-[#1a1a1a]" />
              )}
              {!isSel && broken && !occupied && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border border-[#1a1a1a]" />
              )}
              {!isSel && groupRes && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border border-[#1a1a1a]" />
              )}
            </button>
          );
        })}
      </div>
      </div>
    );
  }

  // Spatial view grouped by room
  const rooms = [...new Set(dianas.map(d => d.room ?? "Sala 1"))].sort();
  const positioned   = dianas.filter(d => d.posX != null && d.posY != null);
  const unpositioned = dianas.filter(d => d.posX == null);

  return (
    <div className="space-y-4">
      {rooms.map(room => {
        const roomDianas = positioned.filter(d => (d.room ?? "Sala 1") === room);
        if (roomDianas.length === 0) return null;
        const maxX = Math.max(...roomDianas.map(d => d.posX!)) + 1;
        const maxY = Math.max(...roomDianas.map(d => d.posY!)) + 1;
        return (
          <div key={room}>
            {rooms.length > 1 && (
              <p className="text-[11px] text-ink-600 font-semibold uppercase tracking-widest mb-2">{room}</p>
            )}
            <div
              className="relative overflow-x-auto rounded-xl border border-ink-800 bg-ink-950"
              style={{ height: maxY * MINI_CELL }}
            >
              <div className="relative" style={{ width: maxX * MINI_CELL, height: maxY * MINI_CELL }}>
                {roomDianas.map(d => {
                  const occupied = !!d.matchId;
                  const broken   = !!d.broken;
                  const groupRes = !occupied && !broken && !!groupAssignedNums?.has(d.number);
                  const isSel    = selectMode && selectedIds?.has(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => onClickDiana(d)}
                      title={
                        occupied  ? `Diana ${d.number} — En uso` :
                        broken    ? `Diana ${d.number} — Averiada` :
                        groupRes  ? `Diana ${d.number} — Reservada · ${groupAssignedInfo?.get(d.number) ?? "grupo RR"}` :
                                    `Diana ${d.number} — Libre`
                      }
                      className={clsx(
                        "absolute flex items-center justify-center rounded-lg font-bold text-xs border-2 transition-all",
                        isSel
                          ? "bg-blue-900/50 border-blue-400 text-blue-200 ring-1 ring-blue-400/50"
                          : occupied
                          ? "bg-red-900/50 border-red-600/60 text-red-300 hover:bg-red-800/60 shadow-[0_0_6px_0_rgba(239,68,68,0.3)]"
                          : broken
                          ? "bg-amber-900/40 border-amber-600/60 text-amber-300 hover:bg-amber-800/50"
                          : groupRes
                          ? "bg-orange-900/40 border-orange-600/60 text-orange-300 hover:bg-orange-800/50"
                          : "bg-green-900/30 border-green-700/40 text-green-400 hover:bg-green-800/40"
                      )}
                      style={{
                        left:   d.posX! * MINI_CELL + 2,
                        top:    d.posY! * MINI_CELL + 2,
                        width:  MINI_CELL - 4,
                        height: MINI_CELL - 4,
                      }}
                    >
                      {d.number}
                      {isSel && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-400 border border-[#1a1a1a] flex items-center justify-center">
                          <Check className="w-1.5 h-1.5 text-white" />
                        </span>
                      )}
                      {!isSel && occupied && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-[#1a1a1a]" />
                      )}
                      {!isSel && broken && !occupied && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 border border-[#1a1a1a]" />
                      )}
                      {!isSel && groupRes && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange-500 border border-[#1a1a1a]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      {unpositioned.length > 0 && (
        <div>
          <p className="text-[11px] text-ink-600 mb-1.5">Sin posicionar ({unpositioned.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {unpositioned.map(d => {
              const occupied = !!d.matchId;
              const broken   = !!d.broken;
              const groupRes = !occupied && !broken && !!groupAssignedNums?.has(d.number);
              const isSel    = selectMode && selectedIds?.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => onClickDiana(d)}
                  className={clsx(
                    "w-10 h-10 rounded-lg font-bold text-xs border-2 relative transition-all",
                    isSel
                      ? "bg-blue-900/50 border-blue-400 text-blue-200 ring-1 ring-blue-400/50 scale-95"
                      : occupied
                      ? "bg-red-900/40 border-red-600/60 text-red-300"
                      : broken
                      ? "bg-amber-900/40 border-amber-600/60 text-amber-300 hover:bg-amber-800/50"
                      : groupRes
                      ? "bg-orange-900/40 border-orange-600/60 text-orange-300 hover:bg-orange-800/50"
                      : "bg-green-900/30 border-green-700/40 text-green-400 hover:bg-green-800/40"
                  )}
                >
                  {d.number}
                  {isSel && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-400 border border-[#1a1a1a] flex items-center justify-center">
                      <Check className="w-1.5 h-1.5 text-white" />
                    </span>
                  )}
                  {!isSel && occupied && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-[#1a1a1a]" />
                  )}
                  {!isSel && broken && !occupied && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-[#1a1a1a]" />
                  )}
                  {!isSel && groupRes && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 border border-[#1a1a1a]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Free / broken diana panel ───────────────────────────────────────────────

interface FreeDianaPanelProps {
  diana:        Diana;
  tournament:   Tournament;
  onDataChange: () => void;
  onClose:      () => void;
  /** "Grupo A · Nivel 1" label if diana is RR-reserved */
  rrGroupLabel?: string;
}

function FreeDianaPanel({ diana, tournament, onDataChange, onClose, rrGroupLabel }: FreeDianaPanelProps) {
  const [busy,    setBusy]    = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handleToggleBroken = async () => {
    setBusy(true);
    try {
      const res = await api.patch(`/tournaments/${tournament.id}/dianas/${diana.id}/broken`);
      toast.success(res.data.message);
      onDataChange();
      onClose();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await api.delete(`/tournaments/${tournament.id}/dianas/${diana.id}`);
      toast.success(res.data.message);
      onDataChange();
      onClose();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
    finally { setBusy(false); setConfirm(false); }
  };

  return (
    <div className={clsx(
      "rounded-2xl p-4 space-y-3 border",
      diana.broken
        ? "bg-amber-950/20 border-amber-700/40"
        : rrGroupLabel
        ? "bg-orange-950/20 border-orange-800/40"
        : "bg-ink-900 border-ink-800"
    )}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2 text-sm">
          <Target className={clsx("w-4 h-4", diana.broken ? "text-amber-400" : rrGroupLabel ? "text-orange-400" : "text-green-400")} />
          Diana {diana.number}
          {diana.broken
            ? <span className="text-[11px] text-amber-400 font-normal">— Averiada</span>
            : rrGroupLabel
            ? <span className="text-[11px] text-orange-400 font-normal">— Reservada · {rrGroupLabel}</span>
            : <span className="text-[11px] text-green-400 font-normal">— Libre</span>}
        </h3>
        <button onClick={onClose} className="text-ink-600 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle broken */}
        <button
          onClick={handleToggleBroken}
          disabled={busy}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50",
            diana.broken
              ? "border-green-700/50 text-green-300 hover:bg-green-900/20"
              : "border-amber-700/50 text-amber-300 hover:bg-amber-900/20"
          )}
        >
          <Wrench className="w-3.5 h-3.5" />
          {diana.broken ? "Marcar reparada" : "Marcar averiada"}
        </button>

        {/* Delete */}
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-900/60 text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-red-400">¿Seguro?</span>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            >
              {busy ? "…" : "Sí, eliminar"}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-ink-700 text-ink-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Diana detail panel (active match) ───────────────────────────────────────

interface DianaDetailProps {
  diana: Diana;
  dianas: Diana[];
  tournament: Tournament;
  onDataChange: () => void;
  onReport: (m: Match) => void;
  onClose: () => void;
  skipLocalTTS?: boolean;
}

function DianaDetail({ diana, dianas, tournament, onDataChange, onReport, onClose, skipLocalTTS }: DianaDetailProps) {
  const match = diana.match as Match | null;
  const [freeing, setFreeing] = useState(false);

  // If the assigned match is already completed, offer a force-free button.
  // This handles the edge case where the diana wasn't freed automatically
  // (e.g. a tiebreaker result entered before the bug fix).
  const isStuck = match?.status === "completed";

  const handleForceFree = async () => {
    if (!match) return;
    setFreeing(true);
    try {
      await api.delete(`/tournaments/${tournament.id}/matches/${match.id}/diana`);
      toast.success(`Diana ${diana.number} liberada`);
      onDataChange();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al liberar la diana");
    } finally {
      setFreeing(false);
    }
  };

  return (
    <div className="bg-[#1a1a1a] border border-red-800/40 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-red-400" />
          Diana {diana.number}
          <span className="text-[11px] text-red-400 font-normal">— En uso</span>
        </h3>
        <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {match ? (
        <MatchRow
          match={match}
          dianas={dianas}
          tournament={tournament}
          onDataChange={() => { onDataChange(); onClose(); }}
          onReport={onReport}
          skipLocalTTS={skipLocalTTS}
        />
      ) : (
        <p className="text-sm text-[#666]">No hay partido activo en esta diana.</p>
      )}

      {/* Force-free button — only shown when the match is already completed
          (the diana should have been released automatically but wasn't) */}
      {isStuck && (
        <button
          type="button"
          onClick={handleForceFree}
          disabled={freeing}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold
                     border border-amber-700/50 text-amber-400 bg-amber-900/10
                     hover:bg-amber-900/25 transition-all disabled:opacity-50"
        >
          <Unlock className={clsx("w-3.5 h-3.5", freeing && "animate-pulse")} />
          {freeing ? "Liberando…" : "Liberar diana (partido ya completado)"}
        </button>
      )}
    </div>
  );
}

// ─── Helper: collect all group-assigned diana numbers from localStorage ───────

function getAllGroupAssignedDianas(tournamentId: string): Set<number> {
  const result = new Set<number>();
  try {
    if (typeof window === "undefined") return result;
    const prefix = `rrGroupDianas:${tournamentId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const map = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number[]>;
        Object.values(map).flat().forEach(n => result.add(n));
      }
    }
  } catch { /* noop */ }
  return result;
}

/** Returns a map: diana number → "Grupo X · Nivel Y" label for all RR-reserved dianas */
function getGroupAssignedDianaInfo(tournamentId: string): Map<number, string> {
  const result = new Map<number, string>();
  try {
    if (typeof window === "undefined") return result;
    const prefix = `rrGroupDianas:${tournamentId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        // key format: rrGroupDianas:{tournamentId}:{level}
        const level = key.slice(prefix.length);
        const levelLabel = level === "default" ? "" : ` · ${level}`;
        const map = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number[]>;
        for (const [groupName, nums] of Object.entries(map)) {
          for (const n of nums) {
            result.set(n, `Grupo ${groupName}${levelLabel}`);
          }
        }
      }
    }
  } catch { /* noop */ }
  return result;
}

// ─── Main GestionTab ──────────────────────────────────────────────────────────

interface GestionTabProps {
  tournament: Tournament;
  matches:    Match[];
  onMatchesChange: () => void;
  onAnnouncerSpeak?: (cb: (payload: any) => void) => (() => void);
  emitSocket?: (event: string, ...args: any[]) => void;
  socketConnected?: boolean;
}

export function GestionTab({ tournament, matches, onMatchesChange, onAnnouncerSpeak, emitSocket, socketConnected }: GestionTabProps) {
  const [dianas, setDianas]               = useState<Diana[]>([]);
  const [loadingDianas, setLoadingDianas] = useState(true);
  const [dianaCount, setDianaCount]       = useState<number | string>("");
  const [settingUp, setSettingUp]         = useState(false);
  const [selectedDiana,    setSelectedDiana]    = useState<Diana | null>(null);
  const [reportMatch,      setReportMatch]      = useState<Match | null>(null);
  const [showSetup,        setShowSetup]        = useState(false);
  const [showFloorPlan,    setShowFloorPlan]    = useState(false);
  const [selectMode,       setSelectMode]       = useState(false);
  const [selectedIds,      setSelectedIds]      = useState<Set<string>>(new Set());
  const [bulkDeleting,     setBulkDeleting]     = useState(false);
  const [confirmBulkDel,   setConfirmBulkDel]   = useState(false);
  const [launchingLevels,  setLaunchingLevels]  = useState<Set<string>>(new Set());

  // ── Referee management ─────────────────────────────────────────────────────
  const [referees, setReferees] = useState<any[]>([]);
  const [refereeSearch, setRefereeSearch] = useState("");
  const [refereeSearchResults, setRefereeSearchResults] = useState<any[]>([]);
  const [refereeSearching, setRefereeSearching] = useState(false);
  const [refereeDialogUser, setRefereeDialogUser] = useState<any>(null);
  const [refDianaStart, setRefDianaStart] = useState("");
  const [refDianaEnd, setRefDianaEnd] = useState("");
  const [refAdding, setRefAdding] = useState(false);

  // ── Master speaker (PA) ────────────────────────────────────────────────────
  // Persist across page reloads via localStorage
  const masterSpeakerKey = `masterSpeaker:${tournament.id}`;
  const [isMasterSpeaker, setIsMasterSpeaker] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`masterSpeaker:${tournament.id}`) === "true";
  });

  const toggleMasterSpeaker = () => {
    setIsMasterSpeaker(prev => {
      const next = !prev;
      if (next) localStorage.setItem(masterSpeakerKey, "true");
      else       localStorage.removeItem(masterSpeakerKey);
      return next;
    });
  };

  const loadDianas = useCallback(async () => {
    try {
      const res = await api.get(`/tournaments/${tournament.id}/dianas`);
      setDianas(res.data.data);
    } catch { /* silent */ }
    finally { setLoadingDianas(false); }
  }, [tournament.id]);

  useEffect(() => { loadDianas(); }, [loadDianas]);

  // Load referees on mount
  useEffect(() => {
    api.get(`/tournaments/${tournament.id}/referees`)
      .then(r => setReferees(r.data.data ?? []))
      .catch(() => {});
  }, [tournament.id]);

  // Search users for referee (debounced)
  useEffect(() => {
    if (refereeSearch.length < 2) { setRefereeSearchResults([]); return; }
    const t = setTimeout(async () => {
      setRefereeSearching(true);
      try {
        const r = await api.get(`/users/search?q=${encodeURIComponent(refereeSearch)}`);
        setRefereeSearchResults(r.data.data ?? []);
      } catch { /* silent */ } finally { setRefereeSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [refereeSearch]);

  // Master speaker: register/unregister with socket when toggled
  useEffect(() => {
    if (!emitSocket) return;
    if (isMasterSpeaker) {
      emitSocket("announcer:register", tournament.id);
    } else {
      emitSocket("announcer:unregister", tournament.id);
    }
  }, [isMasterSpeaker, emitSocket, tournament.id]);

  // Re-register when socket reconnects (page reload, tab switch, network blip)
  const prevConnected = useRef(false);
  useEffect(() => {
    if (socketConnected && !prevConnected.current && isMasterSpeaker && emitSocket) {
      emitSocket("announcer:register", tournament.id);
    }
    prevConnected.current = !!socketConnected;
  }, [socketConnected, isMasterSpeaker, emitSocket, tournament.id]);

  // Listen for announcer:speak events and play TTS if this device is the master speaker
  useEffect(() => {
    if (!onAnnouncerSpeak || !isMasterSpeaker) return;
    const unsub = onAnnouncerSpeak(async (payload: any) => {
      const { p1, p2, p3, diana, callNumber } = payload;
      if (callNumber === 1) {
        await announceMatch(p1, p2, diana, p3);
      } else {
        await announceWarning(p1, diana, callNumber as 2 | 3);
      }
    });
    return unsub;
  }, [onAnnouncerSpeak, isMasterSpeaker]);

  const handleAddReferee = async () => {
    if (!refereeDialogUser) return;
    setRefAdding(true);
    try {
      const r = await api.post(`/tournaments/${tournament.id}/referees`, {
        userId: refereeDialogUser.id,
        dianaStart: refDianaStart ? parseInt(refDianaStart) : null,
        dianaEnd: refDianaEnd ? parseInt(refDianaEnd) : null,
      });
      setReferees(prev => [...prev.filter((x: any) => x.userId !== refereeDialogUser.id), r.data.data]);
      setRefereeDialogUser(null);
      setRefereeSearch("");
      setRefDianaStart("");
      setRefDianaEnd("");
      toast.success("Árbitro asignado");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error");
    } finally { setRefAdding(false); }
  };

  const handleRemoveReferee = async (refereeId: string) => {
    try {
      await api.delete(`/tournaments/${tournament.id}/referees/${refereeId}`);
      setReferees(prev => prev.filter((r: any) => r.id !== refereeId));
      toast.success("Árbitro eliminado");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error");
    }
  };

  const handleDataChange = () => { loadDianas(); onMatchesChange(); };

  // Launch all diana-assigned matches for a given level in one click
  const handleLaunchAll = async (lvl: string, lvlMatches: Match[]) => {
    // Only matches that already have a diana assigned
    const ready = lvlMatches.filter(m => dianas.some(d => d.matchId === m.id));
    if (ready.length === 0) return;

    setLaunchingLevels(prev => new Set([...prev, lvl]));
    try {
      await Promise.all(ready.map(async m => {
        const assignedDiana = dianas.find(d => d.matchId === m.id);
        await api.post(`/tournaments/${tournament.id}/matches/${m.id}/launch`);
        if (assignedDiana && !isMasterSpeaker) {
          void announceMatch(
            playerName(m.participant1),
            playerName(m.participant2),
            assignedDiana.number,
            m.participant3 ? playerName(m.participant3) : undefined,
          );
        }
      }));
      toast.success(`${ready.length} partido${ready.length !== 1 ? "s" : ""} lanzado${ready.length !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al lanzar");
    } finally {
      setLaunchingLevels(prev => { const n = new Set(prev); n.delete(lvl); return n; });
      handleDataChange();
    }
  };

  const handleSetup = async () => {
    const n = Number(dianaCount);
    if (!n || n < 1) return;
    setSettingUp(true);
    try {
      await api.post(`/tournaments/${tournament.id}/dianas/setup`, { count: n });
      toast.success(`Mapa de ${n} dianas creado`);
      setShowSetup(false);
      setDianaCount("");
      loadDianas();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
    finally { setSettingUp(false); }
  };

  const handleClickDiana = (d: Diana) => {
    if (selectMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(d.id) ? next.delete(d.id) : next.add(d.id);
        return next;
      });
      return;
    }
    setSelectedDiana(d);
  };

  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
    setConfirmBulkDel(false);
    setSelectedDiana(null);
  };

  const handleSelectAll = () =>
    setSelectedIds(new Set(dianas.filter(d => !d.matchId).map(d => d.id)));

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await api.post(`/tournaments/${tournament.id}/dianas/bulk-delete`, {
        ids: [...selectedIds],
      });
      const { deleted, skipped } = res.data.data as { deleted: number; skipped: number };
      if (deleted > 0) toast.success(`${deleted} diana${deleted !== 1 ? "s" : ""} eliminada${deleted !== 1 ? "s" : ""}`);
      if (skipped > 0) toast.error(`${skipped} no se pudieron eliminar (en uso)`);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al eliminar");
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDel(false);
      setSelectedIds(new Set());
      setSelectMode(false);
      handleDataChange();
    }
  };

  // Pending matches with both players present
  const pendingMatches = matches.filter(
    m => m.status === "pending" && m.participant1 && m.participant2
  );

  // Live clock — ticks every 30 s to re-evaluate overdue matches
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // A match stays on top until it has been launched (launch1At set).
  // Assigning a diana alone does NOT move it down — only pressing Lanzar does.
  const launchedMatches = pendingMatches.filter(m => !!m.launch1At);

  // Busy participants: called in an active match (1st call done, 3rd not yet done).
  // After 3 calls the backend allows re-scheduling so we mirror that logic here.
  const busyParticipantIds = new Set<string>(
    launchedMatches
      .filter(m => !m.launch3At)
      .flatMap(m => [m.participant1?.id, m.participant2?.id].filter(Boolean) as string[])
  );

  // ── Round gating for RR matches ──────────────────────────────────────────
  // For round-robin groups, only show the minimum (current) round per level.
  // While any R1 match is still pending (launched or not), R2 should not
  // appear as available — the organizer must complete the current round first.
  // Non-RR (elimination) matches are never gated.
  const minRRRoundByLevel: Record<string, number> = {};
  pendingMatches
    .filter(m => !!m.rrGroup)
    .forEach(m => {
      const key = m.bracketLevel ?? "__default__";
      if (minRRRoundByLevel[key] === undefined || m.round < minRRRoundByLevel[key]) {
        minRRRoundByLevel[key] = m.round;
      }
    });

  // Only show a match as available if:
  // 1. Not yet launched
  // 2. Both players are free
  // 3. For RR matches: it belongs to the current (minimum) round for its level
  const unassignedMatches = pendingMatches.filter(m => {
    if (m.launch1At) return false;
    if (busyParticipantIds.has(m.participant1?.id ?? "__")) return false;
    if (busyParticipantIds.has(m.participant2?.id ?? "__")) return false;
    if (m.rrGroup) {
      const minRound = minRRRoundByLevel[m.bracketLevel ?? "__default__"];
      if (minRound !== undefined && m.round > minRound) return false;
    }
    return true;
  });

  // Overdue: launched and elapsed time > estimatedMatchMinutes
  const thresholdMs = (tournament.estimatedMatchMinutes ?? 15) * 60 * 1000;
  const overdueMatches  = launchedMatches.filter(
    m => m.launch1At && (now - new Date(m.launch1At).getTime()) >= thresholdMs
  );
  const assignedMatches = launchedMatches.filter(
    m => !overdueMatches.includes(m)
  );

  // No-show matches: completed via no-show, kept visible for record / disputes
  const noShowMatches = matches.filter(
    m => !!m.noShowAt && m.participant1 && m.participant2
  );

  // Level groups helper
  const groupByLevel = (list: Match[]) =>
    [...new Set(list.map(m => m.bracketLevel ?? "Sin nivel"))].map(lvl => ({
      lvl,
      matches: list.filter(m => (m.bracketLevel ?? "Sin nivel") === lvl),
    }));

  // Refresh dianas periodically so live status stays updated
  useEffect(() => {
    const interval = setInterval(loadDianas, 15000);
    return () => clearInterval(interval);
  }, [loadDianas]);

  return (
    <>
      {reportMatch && (
        <ReportResultModal
          match={reportMatch}
          tournament={tournament}
          onClose={() => setReportMatch(null)}
          onSuccess={() => { setReportMatch(null); handleDataChange(); }}
        />
      )}

      {showFloorPlan && dianas.length > 0 && (
        <DianaFloorPlanEditor
          tournament={tournament}
          dianas={dianas}
          onClose={() => setShowFloorPlan(false)}
          onSaved={() => { loadDianas(); setShowFloorPlan(false); }}
        />
      )}

      <div className="space-y-6">
        {/* ── Árbitros ─────────────────────────────────────────────────────── */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
            <Target className="w-4 h-4 text-violet-400" /> Árbitros
          </h2>
          {/* Current referees list */}
          {referees.length > 0 && (
            <div className="space-y-2">
              {referees.map((ref: any) => (
                <div key={ref.id} className="flex items-center gap-3 px-3 py-2 bg-ink-800/50 rounded-xl border border-ink-700">
                  <div className="w-7 h-7 rounded-lg bg-violet-900/30 border border-violet-700/40 flex items-center justify-center shrink-0">
                    <Target className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{ref.user.name}</p>
                    <p className="text-[11px] text-ink-500">
                      {ref.dianaStart != null
                        ? `Dianas ${ref.dianaStart}${ref.dianaEnd != null ? `–${ref.dianaEnd}` : "+"}`
                        : "Todas las dianas"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveReferee(ref.id)}
                    className="p-1.5 text-ink-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-900/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add referee */}
          {refereeDialogUser ? (
            <div className="space-y-3 p-3 bg-ink-800/30 rounded-xl border border-ink-700">
              <p className="text-sm font-semibold text-white">{refereeDialogUser.name}</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] text-ink-500 mb-1 block">Diana inicio</label>
                  <input type="number" min="1" value={refDianaStart}
                    onChange={e => setRefDianaStart(e.target.value)}
                    placeholder="Todas"
                    className="w-full h-8 px-2 rounded-lg bg-ink-800 border border-ink-700 text-white text-sm focus:outline-none focus:border-violet-600" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-ink-500 mb-1 block">Diana fin</label>
                  <input type="number" min="1" value={refDianaEnd}
                    onChange={e => setRefDianaEnd(e.target.value)}
                    placeholder="Todas"
                    className="w-full h-8 px-2 rounded-lg bg-ink-800 border border-ink-700 text-white text-sm focus:outline-none focus:border-violet-600" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddReferee}
                  disabled={refAdding}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-violet-700 hover:bg-violet-600 text-white transition-colors disabled:opacity-50"
                >
                  {refAdding ? "Guardando…" : "Asignar árbitro"}
                </button>
                <button
                  onClick={() => setRefereeDialogUser(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-ink-700 text-ink-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={refereeSearch}
                onChange={e => setRefereeSearch(e.target.value)}
                placeholder="Buscar jugador para asignar como árbitro…"
                className="w-full h-9 px-3 rounded-xl bg-ink-800 border border-ink-700 text-white text-sm placeholder-ink-500 focus:outline-none focus:border-violet-600"
              />
              {(refereeSearchResults.length > 0 || refereeSearching) && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-ink-900 border border-ink-700 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                  {refereeSearching ? (
                    <div className="px-3 py-2 text-xs text-ink-500">Buscando…</div>
                  ) : refereeSearchResults.map((u: any) => (
                    <button
                      key={u.id}
                      onClick={() => { setRefereeDialogUser(u); setRefereeSearch(""); setRefereeSearchResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-ink-800 transition-colors"
                    >
                      <p className="text-sm text-white font-semibold">{u.name}</p>
                      <p className="text-[11px] text-ink-500">{u.email}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Altavoces (Master Speaker) ────────────────────────────────────── */}
        <div className={clsx(
          "border rounded-2xl p-4 flex items-center justify-between gap-4",
          isMasterSpeaker
            ? "bg-green-900/15 border-green-700/50"
            : "bg-ink-900 border-ink-800"
        )}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {isMasterSpeaker
                ? <Volume2 className="w-4 h-4 text-green-400 shrink-0" />
                : <VolumeX className="w-4 h-4 text-ink-500 shrink-0" />}
              <span className={clsx("text-sm font-bold", isMasterSpeaker ? "text-green-300" : "text-white")}>
                {isMasterSpeaker ? "Altavoces activos" : "Altavoces desactivados"}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              {isMasterSpeaker
                ? "Este dispositivo es el altavoz central. Las llamadas se anunciarán aquí."
                : "Activa para convertir este dispositivo en el altavoz central del torneo."}
            </p>
          </div>
          <button
            onClick={toggleMasterSpeaker}
            className={clsx(
              "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
              isMasterSpeaker
                ? "bg-ink-800 border border-ink-700 text-ink-300 hover:bg-red-900/20 hover:text-red-400 hover:border-red-800/40"
                : "bg-green-600 hover:bg-green-500 text-white shadow-lg"
            )}
          >
            {isMasterSpeaker ? "Desactivar" : "Activar altavoces"}
          </button>
        </div>

        {/* ── Diana map ────────────────────────────────────────────────────── */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-red-400" />
              Mapa de Dianas
              <span className="text-xs font-normal text-ink-500">
                {dianas.filter(d => !d.matchId && !d.broken).length} libres · {dianas.filter(d => d.broken).length > 0 ? `${dianas.filter(d => d.broken).length} averiadas · ` : ""}{dianas.length} total
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSetup(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-ink-700 text-ink-400 hover:text-white hover:border-ink-500 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Configurar
              </button>
              {dianas.length > 0 && (
                <>
                  <button
                    onClick={() => setShowFloorPlan(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-ink-700 text-ink-400 hover:text-white hover:border-ink-500 transition-colors"
                    title="Editar posiciones de las dianas en el plano de la sala"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> Editar plano
                  </button>
                  <button
                    onClick={toggleSelectMode}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      selectMode
                        ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                        : "border-ink-700 text-ink-400 hover:text-white hover:border-ink-500"
                    )}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectMode ? "Cancelar" : "Seleccionar"}
                  </button>
                </>
              )}
              <button onClick={loadDianas} className="p-1.5 rounded-lg hover:bg-ink-800 text-ink-600 hover:text-ink-400 transition-colors" title="Refrescar">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Setup panel */}
          {showSetup && (
            <div className="flex items-center gap-3 p-3 bg-ink-950 rounded-xl border border-ink-800">
              <label className="text-xs text-ink-500 whitespace-nowrap">Número de dianas:</label>
              <input
                type="number"
                min={1} max={500}
                value={dianaCount}
                onChange={e => setDianaCount(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSetup()}
                className="w-24 bg-ink-900 border border-ink-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-600/60"
                placeholder="40"
              />
              <button
                onClick={handleSetup}
                disabled={!dianaCount || settingUp}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-40 transition-colors"
              >
                {settingUp ? "Creando…" : "Crear mapa"}
              </button>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-ink-600 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-900/50 border border-green-700/50" />
              Libre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-900/50 border border-orange-600/50" />
              Asignada (grupo)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-900/50 border border-red-600/50" />
              Ocupada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-900/50 border border-amber-600/50" />
              Averiada
            </span>
            <span className="text-ink-700">· Haz clic para gestionar</span>
          </div>

          {/* ── Select-mode action bar ── */}
          {selectMode && (
            <div className="flex items-center gap-3 p-3 bg-blue-950/30 rounded-xl border border-blue-800/40 flex-wrap">
              <span className="text-xs text-blue-300 font-semibold">
                {selectedIds.size} de {dianas.filter(d => !d.matchId).length} seleccionadas
              </span>
              <button
                onClick={handleSelectAll}
                className="text-xs text-blue-400 hover:text-blue-200 underline underline-offset-2 transition-colors"
              >
                Seleccionar todas (sin partido)
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-ink-500 hover:text-ink-300 underline underline-offset-2 transition-colors"
                >
                  Deseleccionar
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {!confirmBulkDel ? (
                  <button
                    onClick={() => setConfirmBulkDel(true)}
                    disabled={selectedIds.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-700/60 text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400 font-semibold">
                      ¿Eliminar {selectedIds.size} diana{selectedIds.size !== 1 ? "s" : ""}?
                    </span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                    >
                      {bulkDeleting ? "Eliminando…" : "Sí, eliminar"}
                    </button>
                    <button
                      onClick={() => setConfirmBulkDel(false)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-ink-700 text-ink-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {loadingDianas ? (
            <div className="flex items-center gap-2 text-ink-600 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Cargando dianas…
            </div>
          ) : dianas.length === 0 ? (
            <p className="text-sm text-ink-600 italic">
              No hay dianas configuradas. Haz clic en "Configurar" para crear el mapa.
            </p>
          ) : (
            <DianaGrid
              dianas={dianas}
              onClickDiana={handleClickDiana}
              selectMode={selectMode}
              selectedIds={selectedIds}
              groupAssignedNums={getAllGroupAssignedDianas(tournament.id)}
              groupAssignedInfo={getGroupAssignedDianaInfo(tournament.id)}
            />
          )}

          {/* Selected diana detail — hidden in select mode */}
          {!selectMode && selectedDiana && (
            selectedDiana.matchId ? (
              <DianaDetail
                diana={selectedDiana}
                dianas={dianas}
                tournament={tournament}
                onDataChange={() => { handleDataChange(); setSelectedDiana(null); }}
                onReport={m => setReportMatch(m)}
                onClose={() => setSelectedDiana(null)}
                skipLocalTTS={isMasterSpeaker}
              />
            ) : (
              <FreeDianaPanel
                diana={selectedDiana}
                tournament={tournament}
                onDataChange={() => { handleDataChange(); setSelectedDiana(null); }}
                onClose={() => setSelectedDiana(null)}
                rrGroupLabel={getGroupAssignedDianaInfo(tournament.id).get(selectedDiana.number)}
              />
            )
          )}
        </div>

        {/* ── Match queue ──────────────────────────────────────────────────── */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-5">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-400" />
            Partidos Disponibles
            <span className="text-xs font-normal text-ink-500">
              {unassignedMatches.length} sin lanzar · {assignedMatches.length} en curso{overdueMatches.length > 0 && <span className="text-amber-400 font-bold"> · {overdueMatches.length} ⚠ sin resultado</span>} · {noShowMatches.length} eliminados
            </span>
          </h2>

          {pendingMatches.length === 0 && noShowMatches.length === 0 ? (
            <p className="text-sm text-ink-600 italic">No hay partidos pendientes con ambos jugadores asignados.</p>
          ) : (
            <>
              {/* ── Overdue: launched but no result yet (top, blinking) ── */}
              {overdueMatches.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 animate-pulse">
                      ⚠ Sin resultado — verificar
                    </span>
                    <div className="h-px flex-1 bg-amber-900/40" />
                    <span className="text-[10px] text-amber-700">{overdueMatches.length}</span>
                  </div>
                  {groupByLevel(overdueMatches).map(({ lvl, matches: lvlMatches }) => (
                    <div key={lvl} className="space-y-2">
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] font-semibold text-ink-500">{lvl}</span>
                        <div className="h-px flex-1 bg-ink-800/60" />
                      </div>
                      {lvlMatches.map(m => (
                        <MatchRow
                          key={m.id}
                          match={m}
                          dianas={dianas}
                          tournament={tournament}
                          onDataChange={handleDataChange}
                          onReport={mm => setReportMatch(mm)}
                          overdue
                          skipLocalTTS={isMasterSpeaker}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="h-px bg-ink-800" />
                </div>
              )}

              {/* ── Unassigned (top) ── */}
              {unassignedMatches.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Pendientes de lanzar</span>
                    <div className="h-px flex-1 bg-ink-800" />
                    <span className="text-[10px] text-ink-700">{unassignedMatches.length}</span>
                  </div>
                  {groupByLevel(unassignedMatches).map(({ lvl, matches: lvlMatches }) => {
                    const readyCount = lvlMatches.filter(m => dianas.some(d => d.matchId === m.id)).length;
                    const isLaunching = launchingLevels.has(lvl);
                    return (
                      <div key={lvl} className="space-y-2">
                        <div className="flex items-center gap-2 pl-1">
                          <span className="text-[10px] font-semibold text-ink-500">{lvl}</span>
                          <div className="h-px flex-1 bg-ink-800/60" />
                          {/* "Lanzar todos" — only shown when at least one match has a diana assigned */}
                          {readyCount > 0 && (
                            <button
                              type="button"
                              disabled={isLaunching}
                              onClick={() => handleLaunchAll(lvl, lvlMatches)}
                              className={clsx(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all",
                                isLaunching
                                  ? "bg-emerald-900/30 text-emerald-600 cursor-not-allowed"
                                  : "bg-emerald-700 hover:bg-emerald-600 text-white"
                              )}
                            >
                              {isLaunching
                                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Lanzando…</>
                                : <><Play className="w-3 h-3" /> Lanzar todos ({readyCount})</>
                              }
                            </button>
                          )}
                        </div>
                        {lvlMatches.map(m => (
                          <MatchRow
                            key={m.id}
                            match={m}
                            dianas={dianas}
                            tournament={tournament}
                            onDataChange={handleDataChange}
                            onReport={mm => setReportMatch(mm)}
                            skipLocalTTS={isMasterSpeaker}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Assigned / in play (bottom) ── */}
              {assignedMatches.length > 0 && (
                <div className="space-y-4">
                  {unassignedMatches.length > 0 && <div className="h-px bg-ink-800" />}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">En diana</span>
                    <div className="h-px flex-1 bg-ink-800" />
                    <span className="text-[10px] text-ink-700">{assignedMatches.length}</span>
                  </div>
                  {groupByLevel(assignedMatches).map(({ lvl, matches: lvlMatches }) => (
                    <div key={lvl} className="space-y-2">
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] font-semibold text-ink-500">{lvl}</span>
                        <div className="h-px flex-1 bg-ink-800/60" />
                      </div>
                      {lvlMatches.map(m => (
                        <MatchRow
                          key={m.id}
                          match={m}
                          dianas={dianas}
                          tournament={tournament}
                          onDataChange={handleDataChange}
                          onReport={mm => setReportMatch(mm)}
                          skipLocalTTS={isMasterSpeaker}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ── No-show record (bottom) ── */}
              {noShowMatches.length > 0 && (
                <div className="space-y-4">
                  {(unassignedMatches.length > 0 || assignedMatches.length > 0) && (
                    <div className="h-px bg-ink-800" />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                      No presentados
                    </span>
                    <div className="h-px flex-1 bg-red-900/30" />
                    <span className="text-[10px] text-red-700">{noShowMatches.length}</span>
                  </div>
                  {groupByLevel(noShowMatches).map(({ lvl, matches: lvlMatches }) => (
                    <div key={lvl} className="space-y-2">
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[10px] font-semibold text-ink-500">{lvl}</span>
                        <div className="h-px flex-1 bg-ink-800/60" />
                      </div>
                      {lvlMatches.map(m => (
                        <MatchRow
                          key={m.id}
                          match={m}
                          dianas={dianas}
                          tournament={tournament}
                          onDataChange={handleDataChange}
                          onReport={mm => setReportMatch(mm)}
                          skipLocalTTS={isMasterSpeaker}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
