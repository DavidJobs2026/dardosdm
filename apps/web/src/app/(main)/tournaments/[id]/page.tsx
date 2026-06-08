"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { use } from "react";
import { api } from "@/lib/api";
import { Tournament, Match, Participant, Bracket, BracketRound } from "@tournament/types";
import { useAuthStore } from "@/store/auth.store";
import { useSocket } from "@/hooks/useSocket";
import { BracketView } from "@/components/bracket/BracketView";
import { RRView } from "@/components/bracket/RRView";
import { ReportResultModal } from "@/components/bracket/ReportResultModal";
import { BracketLaunchModal } from "@/components/bracket/BracketLaunchModal";
import { StandingsView, computeStandings } from "@/components/bracket/StandingsView";
import { GestionTab } from "@/components/management/GestionTab";
import toast from "react-hot-toast";
import {
  Trophy, Users, Calendar, Play, CheckCircle, BarChart2,
  UserPlus, Shuffle, ArrowLeft, Network, Trash2, Settings2,
  Banknote, CreditCard, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  RotateCcw, RefreshCw, X, Target, Pencil, Loader2,
} from "lucide-react";
import {
  SizeSelector, BestOfSelector, LevelBuilder, LevelData, SeasonSelector,
  FORMAT_OPTIONS, GAME_OPTIONS, METRIC_OPTIONS, toDatetimeLocal,
} from "@/components/tournament/TournamentFormShared";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { InscriptionPanel } from "@/components/tournament/InscriptionPanel";
import { TournamentImageUpload } from "@/components/tournament/TournamentImageUpload";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { clsx } from "clsx";
import { createPortal } from "react-dom";

// ─── Helpers ──────────────────────────────────────────────────────────────────


/** Returns which TournamentLevel a participant belongs to based on their metricValue.
 *  Levels are checked highest-order first so an open-ended lower level (maxValue=null)
 *  doesn't swallow players that belong to a more exclusive higher level. */
function assignLevel(
  metricValue: number | null | undefined,
  levels: Tournament["levels"]
): Tournament["levels"][number] | null {
  if (metricValue == null || !levels?.length) return null;
  const sorted = [...levels].sort((a, b) => b.order - a.order); // highest tier first
  return sorted.find(l => {
    const aboveMin = metricValue >= l.minValue;
    const belowMax = l.maxValue == null || metricValue <= l.maxValue;
    return aboveMin && belowMax;
  }) ?? null;
}

const LEVEL_PALETTE = [
  { badge: "bg-yellow-500",  border: "border-yellow-600/50", bg: "bg-yellow-900/10", text: "text-yellow-300", count: "text-yellow-500/70" },
  { badge: "bg-cyan-500",    border: "border-cyan-600/50",   bg: "bg-cyan-900/10",   text: "text-cyan-300",   count: "text-cyan-500/70"   },
  { badge: "bg-green-500",   border: "border-green-600/50",  bg: "bg-green-900/10",  text: "text-green-300",  count: "text-green-500/70"  },
  { badge: "bg-purple-500",  border: "border-purple-600/50", bg: "bg-purple-900/10", text: "text-purple-300", count: "text-purple-500/70" },
  { badge: "bg-orange-500",  border: "border-orange-600/50", bg: "bg-orange-900/10", text: "text-orange-300", count: "text-orange-500/70" },
  { badge: "bg-pink-500",    border: "border-pink-600/50",   bg: "bg-pink-900/10",   text: "text-pink-300",   count: "text-pink-500/70"   },
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", registration: "Inscripciones abiertas",
  in_progress: "En curso", completed: "Finalizado", cancelled: "Cancelado",
};
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300",
  registration: "bg-blue-900/50 text-blue-300",
  in_progress: "bg-green-900/50 text-green-300",
  completed: "bg-purple-900/50 text-purple-300",
  cancelled: "bg-red-900/50 text-red-300",
};
const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Eliminación Simple",
  double_elimination: "Doble Eliminación",
  round_robin: "Round Robin + K.O.",
};
const ROUND_NAMES = ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda de 16", "Ronda de 32"];

// ─── Participants list (simple or level-grouped) ──────────────────────────────

function PaymentBadge({
  participant,
  canToggle,
  onToggle,
}: {
  participant: Participant;
  canToggle:   boolean;
  onToggle:    (status: "pending" | "paid", method: "cash" | "card" | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  const isPaid = participant.paymentStatus === "paid";

  // Close picker on outside click
  useEffect(() => {
    if (!picking) return;
    const handler = (e: MouseEvent) => {
      const portalEl = document.getElementById("payment-badge-portal");
      if (portalEl?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setPicking(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [picking]);

  const openPicker = () => {
    if (!canToggle) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setPicking(p => !p);
  };

  if (isPaid) {
    return (
      <button
        onClick={() => canToggle && onToggle("pending", null)}
        disabled={!canToggle}
        title={canToggle ? "Click para marcar como Pendiente" : undefined}
        className={clsx(
          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all shrink-0",
          "text-green-300 bg-green-900/25 border-green-700/50",
          canToggle && "hover:bg-green-900/40 cursor-pointer"
        )}
      >
        <CheckCircle className="w-3 h-3" />
        {participant.paymentMethod === "cash"
          ? <Banknote className="w-3 h-3" />
          : participant.paymentMethod === "card"
          ? <CreditCard className="w-3 h-3" />
          : null}
        Pagado
      </button>
    );
  }

  if (participant.paymentStatus === "pending") {
    return (
      <div className="relative shrink-0">
        <button
          ref={btnRef}
          onClick={openPicker}
          disabled={!canToggle}
          title={canToggle ? "Click para registrar pago" : undefined}
          className={clsx(
            "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all",
            "text-amber-300 bg-amber-900/20 border-amber-700/50",
            canToggle && "hover:bg-amber-900/40 cursor-pointer",
            picking && "ring-1 ring-amber-500/40"
          )}
        >
          <Clock className="w-3 h-3" />
          Pendiente
        </button>

        {(picking && dropPos ? createPortal(
          <div
            id="payment-badge-portal"
            style={{ position: "fixed", top: dropPos.top, right: dropPos.right, zIndex: 9999 }}
            className="flex gap-1.5 bg-[#1e1e1e] border border-[#333] rounded-xl p-1.5 shadow-xl"
          >
            <button
              onClick={() => { onToggle("paid", "cash"); setPicking(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-green-300 hover:bg-green-900/30 border border-transparent hover:border-green-700/40 transition-all whitespace-nowrap"
            >
              <Banknote className="w-3.5 h-3.5" />
              Efectivo
            </button>
            <button
              onClick={() => { onToggle("paid", "card"); setPicking(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-300 hover:bg-blue-900/30 border border-transparent hover:border-blue-700/40 transition-all whitespace-nowrap"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Tarjeta
            </button>
          </div>,
          document.body
        ) : null) as React.ReactNode}
      </div>
    );
  }

  return null;
}

function ParticipantRow({
  participant,
  index,
  metric,
  isCurrentUser,
  isOrganizer,
  canRemove,
  onRemove,
  onEdit,
  onPaymentToggle,
  compact = false,
}: {
  participant:     Participant;
  index:           number;
  metric?:         string;
  isCurrentUser:   boolean;
  isOrganizer:     boolean;
  canRemove:       boolean;
  onRemove:        (id: string) => void;
  onEdit?:         (p: Participant) => void;
  onPaymentToggle: (id: string, status: "pending" | "paid", method: "cash" | "card" | null) => void;
  compact?:        boolean;
}) {
  const name     = participant.user?.name ?? participant.team?.name ?? "Desconocido";
  const metricLbl = metric === "mpr" ? "MPR" : metric === "combined" ? "COMB" : "PPD";

  return (
    <div className={clsx(
      "flex items-center gap-3 px-4 py-3 transition-colors",
      isCurrentUser ? "bg-red-900/5" : "hover:bg-ink-800/20",
      compact ? "py-2.5" : "py-3.5"
    )}>
      {/* Index / rank */}
      <div className="w-6 text-center shrink-0">
        {participant.finalRank
          ? <span className="text-yellow-400 text-xs">#{participant.finalRank}</span>
          : <span className="text-ink-700 text-xs font-mono">{index + 1}</span>
        }
      </div>

      {/* Name + meta — hidden for players viewing other participants */}
      <div className="flex-1 min-w-0">
        {(isOrganizer || isCurrentUser) ? (
          <>
            {/* ── Line 1: name ── */}
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-white font-bold text-xs truncate">{name}</p>
              {isCurrentUser && (
                <span className="text-[9px] text-red-400 font-semibold bg-red-900/20 px-1.5 py-0.5 rounded shrink-0">tú</span>
              )}
              {participant.finalRank === 1 && <span className="text-[10px] text-yellow-400 shrink-0">🏆</span>}
              {isOrganizer && (participant as any).inscriptionStatus === "pending_web" && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-600/40 text-blue-300 shrink-0 whitespace-nowrap">
                  🌐 Pendiente web
                </span>
              )}
              {isOrganizer && (participant as any).inscriptionStatus === "pending" && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/30 border border-amber-600/40 text-amber-300 shrink-0 whitespace-nowrap">
                  ⏳ Pendiente
                </span>
              )}
            </div>

            {/* ── Line 2: team member names + metrics ── */}
            {participant.team?.members && participant.team.members.length > 0 && (() => {
              const vals = participant.team.members
                .map(m => m.metricValue)
                .filter((v): v is number => v != null);
              const avg = vals.length > 0
                ? vals.reduce((a, b) => a + b, 0) / vals.length
                : null;
              return (
                <div className="flex items-center gap-1 min-w-0 mt-0.5">
                  <p className="text-[10px] text-ink-400 truncate">
                    {participant.team!.members.map(m =>
                      m.metricValue != null
                        ? `${m.user.name} (${m.metricValue.toFixed(2)})`
                        : m.user.name
                    ).join(" · ")}
                  </p>
                  {avg != null && (
                    <>
                      <span className="text-ink-700 shrink-0 text-[10px]">·</span>
                      <span className="text-[10px] text-ink-500 shrink-0">
                        {metricLbl} <span className="text-ink-300 font-semibold">{avg.toFixed(2)}</span>
                      </span>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Sub-line: DNI · metric · games */}
            {!participant.team && (
              <p className="text-[11px] text-ink-500 mt-0.5 truncate">
                {participant.dni && <span>DNI: {participant.dni}</span>}
                {participant.dni && participant.metricValue != null && <span className="mx-1.5 text-ink-700">·</span>}
                {participant.metricValue != null && (
                  <span>{metricLbl}: <span className="text-ink-300 font-semibold">{participant.metricValue.toFixed(2)}</span></span>
                )}
                {participant.gamesPlayed != null && (
                  <>
                    <span className="mx-1.5 text-ink-700">·</span>
                    <span>{participant.gamesPlayed} partidas</span>
                  </>
                )}
              </p>
            )}
          </>
        ) : (
          /* Player view: only show number, no names */
          <p className="text-ink-600 text-xs">Participante {index + 1}</p>
        )}
      </div>

      {/* Payment badge — only visible to organizers */}
      {isOrganizer && (
        <PaymentBadge
          participant={participant}
          canToggle={isOrganizer}
          onToggle={(status, method) => onPaymentToggle(participant.id, status, method)}
        />
      )}

      {/* Edit metric */}
      {canRemove && onEdit && (
        <button
          onClick={() => onEdit(participant)}
          className="text-ink-400 hover:text-blue-400 transition-colors shrink-0 p-1"
          title="Editar media"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Remove */}
      {canRemove && (
        <button
          onClick={() => {
            if (window.confirm(`¿Eliminar a "${name}" del torneo?`)) {
              onRemove(participant.id);
            }
          }}
          className="text-ink-400 hover:text-red-400 transition-colors shrink-0 p-1"
          title="Eliminar participante"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function ParticipantsList({
  tournament,
  participants,
  user,
  isOrganizer,
  startedLevels = new Set(),
  onRemove,
  onEdit,
  onPaymentToggle,
}: {
  tournament:       Tournament;
  participants:     Participant[];
  user:             { id: string } | null;
  isOrganizer:      boolean;
  startedLevels?:   Set<string>;
  onRemove:         (id: string) => void;
  onEdit?:          (p: Participant) => void;
  onPaymentToggle:  (id: string, status: "pending" | "paid", method: "cash" | "card" | null) => void;
}) {
  const hasLevels = (tournament.levels ?? []).length > 0;
  // canRemove checks both tournament status and whether the participant's level has been started
  const canRemoveParticipant = (p: Participant) =>
    isOrganizer &&
    (tournament.status === "registration" || tournament.status === "draft") &&
    !(p.level && startedLevels.has(p.level));
  const metricLbl = tournament.metric === "mpr" ? "MPR" : tournament.metric === "combined" ? "COMB" : "PPD";

  // ── Levelled view ──────────────────────────────────────────────────────────
  if (hasLevels) {
    const sortedLevels = [...(tournament.levels ?? [])].sort((a, b) => a.order - b.order);

    // Assign each participant to a level
    const groups = sortedLevels.map((lvl, li) => {
      const palette = LEVEL_PALETTE[li % LEVEL_PALETTE.length];
      const members = participants.filter(p => {
        const assigned = assignLevel(p.metricValue, tournament.levels ?? []);
        return assigned?.id === lvl.id;
      });
      const paid = members.filter(p => p.paymentStatus === "paid").length;
      return { lvl, palette, members, paid };
    });

    const unassigned = participants.filter(p => {
      const assigned = assignLevel(p.metricValue, tournament.levels ?? []);
      return assigned == null;
    });

    return (
      <div className="space-y-4">
        {/* Header summary */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm uppercase tracking-wider">Participantes inscritos</h3>
          {(() => {
            const paid    = participants.filter(p => p.paymentStatus === "paid");
            const pending = participants.filter(p => p.paymentStatus === "pending");
            const cash    = paid.filter(p => p.paymentMethod === "cash").length;
            const card    = paid.filter(p => p.paymentMethod === "card").length;
            return (
              <div className="flex items-center gap-3 text-xs text-ink-500">
                <span className="font-mono">{participants.length} jugadores</span>
                <span className="text-ink-700">·</span>
                <span className="flex items-center gap-1.5 text-green-400 font-semibold">
                  {paid.length} pagados
                  {paid.length > 0 && (
                    <span className="font-normal text-ink-500">
                      ({cash > 0 && <span className="text-green-500/80">{cash} efectivo</span>}
                      {cash > 0 && card > 0 && <span className="text-ink-600"> · </span>}
                      {card > 0 && <span className="text-blue-400/80">{card} tarjeta</span>})
                    </span>
                  )}
                </span>
                <span className="text-ink-700">·</span>
                <span className="text-amber-400 font-semibold">
                  {pending.length} pendientes
                </span>
              </div>
            );
          })()}
        </div>

        {/* Level groups */}
        {groups.map(({ lvl, palette, members, paid }) => (
          <div
            key={lvl.id}
            className={clsx(
              "rounded-2xl border overflow-hidden",
              palette.border, palette.bg
            )}
          >
            {/* Level header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className={clsx("text-xs font-black px-2.5 py-1 rounded-lg text-white", palette.badge)}>
                  {lvl.name.toUpperCase()}
                </span>
                <span className={clsx("text-xs font-semibold", palette.count)}>
                  {members.length} {members.length === 1 ? "JUGADOR" : "JUGADORES"}
                </span>
                {lvl.minValue > 0 && (
                  <span className="text-[10px] text-ink-600">
                    {metricLbl} {lvl.minValue}{lvl.maxValue != null ? `–${lvl.maxValue}` : "+"}
                  </span>
                )}
              </div>
              <span className={clsx("text-xs font-bold", paid === members.length && members.length > 0 ? "text-green-400" : "text-ink-500")}>
                {paid}/{members.length} PAGADOS
              </span>
            </div>

            {/* Players */}
            {members.length === 0 ? (
              <div className="px-5 py-4 text-xs text-ink-600 text-center">Sin jugadores en este nivel aún</div>
            ) : (
              <div className="divide-y divide-white/5">
                {members.map((p, i) => (
                  <ParticipantRow
                    key={p.id}
                    participant={p}
                    index={i}
                    metric={tournament.metric ?? undefined}
                    isCurrentUser={p.user?.id === user?.id}
                    isOrganizer={isOrganizer}
                    canRemove={canRemoveParticipant(p)}
                    onRemove={onRemove}
                    onEdit={onEdit}
                    onPaymentToggle={onPaymentToggle}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Unassigned group */}
        {unassigned.length > 0 && (
          <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-800">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black px-2.5 py-1 rounded-lg text-white bg-ink-700">SIN NIVEL</span>
                <span className="text-xs text-ink-500">{unassigned.length} jugadores sin métrica asignada</span>
              </div>
            </div>
            <div className="divide-y divide-ink-800/60">
              {unassigned.map((p, i) => (
                <ParticipantRow
                  key={p.id}
                  participant={p}
                  index={i}
                  metric={tournament.metric ?? undefined}
                  isCurrentUser={p.user?.id === user?.id}
                  isOrganizer={isOrganizer}
                  canRemove={canRemoveParticipant(p)}
                  onRemove={onRemove}
                  onEdit={onEdit}
                  onPaymentToggle={onPaymentToggle}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {participants.length === 0 && (
          <div className="bg-ink-900 border border-ink-800 rounded-2xl text-center py-14">
            <Users className="w-10 h-10 mx-auto mb-3 text-ink-800" />
            <p className="text-ink-500 text-sm">Aún no hay participantes inscritos</p>
            {isOrganizer && <p className="text-ink-600 text-xs mt-1">Usa el buscador de arriba para añadir jugadores</p>}
          </div>
        )}
      </div>
    );
  }

  // ── Simple flat view (no levels configured) ────────────────────────────────
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-ink-800 flex items-center justify-between">
        <h3 className="font-bold text-white text-sm uppercase tracking-wider">Participantes inscritos</h3>
        <span className="text-xs text-ink-500 font-mono">
          {participants.length} / {tournament.maxParticipants === 0 ? "∞" : tournament.maxParticipants}
        </span>
      </div>

      {participants.length === 0 ? (
        <div className="text-center py-14">
          <Users className="w-10 h-10 mx-auto mb-3 text-ink-800" />
          <p className="text-ink-500 text-sm">Aún no hay participantes inscritos</p>
          {isOrganizer && <p className="text-ink-600 text-xs mt-1">Usa el buscador de arriba para añadir jugadores</p>}
        </div>
      ) : (
        <div className="divide-y divide-ink-800/60">
          {participants
            .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
            .map((p, i) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                index={i}
                metric={tournament.metric ?? undefined}
                isCurrentUser={p.user?.id === user?.id}
                isOrganizer={isOrganizer}
                canRemove={canRemoveParticipant(p)}
                onRemove={onRemove}
                onEdit={onEdit}
                onPaymentToggle={onPaymentToggle}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ─── Tournament Setup panel — full editable form ─────────────────────────────

function TournamentSetup({
  tournament,
  onSaved,
  onReset,
}: {
  tournament: Tournament;
  onSaved:    () => void;
  onReset:    () => void;
}) {
  const canEdit   = tournament.status === "draft" || tournament.status === "registration";
  const isDouble  = tournament.format === "double_elimination";
  const inputCls  =
    "w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm " +
    "disabled:opacity-40 disabled:cursor-not-allowed";

  // ── form state ──────────────────────────────────────────────────────────────
  const [name,           setName]           = useState(tournament.name);
  const [description,    setDescription]    = useState(tournament.description ?? "");
  const [format,         setFormat]         = useState(tournament.format);
  const [maxParticipants, setMaxParticipants] = useState<number | undefined>(
    tournament.maxParticipants === 0 ? undefined : tournament.maxParticipants
  );
  const [participantType, setParticipantType] = useState(tournament.participantType);
  const [startDate,      setStartDate]      = useState(
    tournament.startDate ? toDatetimeLocal(tournament.startDate) : ""
  );
  const [gameType,       setGameType]       = useState<string | undefined>(tournament.gameType ?? undefined);
  const [metric,         setMetric]         = useState<string | undefined>(tournament.metric ?? undefined);
  const [levels,         setLevels]         = useState<LevelData[]>(
    (tournament.levels ?? []).map(l => ({
      name:            l.name,
      minValue:        l.minValue,
      maxValue:        l.maxValue ?? undefined,
      maxParticipants: l.maxParticipants ?? undefined,
      order:           l.order,
      bestOf:          l.bestOf ?? tournament.bestOf ?? 3,
      bestOfLosers:    l.bestOfLosers ?? undefined, // null = inherit same as level bestOf (shown via toggle in LevelBuilder)
    }))
  );
  const [bestOf,         setBestOf]         = useState<number>(tournament.bestOf ?? 3);
  const [bestOfLosers,   setBestOfLosers]   = useState<number | null>(tournament.bestOfLosers ?? null);
  const [useSameLosers,  setUseSameLosers]  = useState(tournament.bestOfLosers == null);
  const [showRules,      setShowRules]      = useState(!!tournament.rules);
  const [rules,          setRules]          = useState(tournament.rules ?? "");
  const [winnerOnly,            setWinnerOnly]            = useState(tournament.winnerOnly ?? false);
  const [estimatedMatchMinutes, setEstimatedMatchMinutes] = useState<number>(tournament.estimatedMatchMinutes ?? 15);
  const [rrGroupSize,           setRrGroupSize]           = useState<number>(tournament.rrGroupSize ?? 4);
  const [rrAdvancingTeams,      setRrAdvancingTeams]      = useState<number>(tournament.rrAdvancingTeams ?? 2);
  const [teamSizeMin,           setTeamSizeMin]           = useState<number>(tournament.teamSizeMin ?? tournament.teamSize ?? 4);
  const [teamSizeMax,           setTeamSizeMax]           = useState<number>(tournament.teamSize ?? 7);
  const [metricPlayers,         setMetricPlayers]         = useState<number>(tournament.metricPlayers ?? tournament.teamSize ?? 4);
  const [maxMetric,             setMaxMetric]             = useState<string>(tournament.maxMetric != null ? String(tournament.maxMetric) : "");
  const [preferredSeason,       setPreferredSeason]       = useState<string | null>((tournament as any).preferredSeason ?? null);
  const [imageUrl,              setImageUrl]              = useState<string | null>(tournament.imageUrl ?? null);
  const [allowPlayerReg,        setAllowPlayerReg]        = useState<boolean>((tournament as any).allowPlayerReg ?? false);
  const [isPublic,              setIsPublic]              = useState<boolean>((tournament as any).isPublic ?? false);
  const [togglingPublic,        setTogglingPublic]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [resetting,      setResetting]      = useState(false);

  // when format changes, clear losers config if not double
  const handleFormatChange = (f: string) => {
    setFormat(f as typeof format);
    if (f !== "double_elimination") {
      setUseSameLosers(true);
      setBestOfLosers(null);
    }
  };

  // Instant publish/unpublish — doesn't require saving the full form
  const handleTogglePublic = async () => {
    setTogglingPublic(true);
    try {
      await api.patch(`/tournaments/${tournament.id}`, { isPublic: !isPublic });
      setIsPublic(v => !v);
      toast.success(!isPublic ? "Torneo publicado — ya visible para jugadores" : "Torneo ocultado — solo visible para organizadores");
      onSaved();
    } catch {
      toast.error("Error al cambiar la visibilidad");
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      await api.patch(`/tournaments/${tournament.id}`, {
        name:            name.trim(),
        description:     description || undefined,
        format,
        maxParticipants: maxParticipants ?? 0,
        participantType,
        rules:           rules || undefined,
        startDate:       startDate ? (isNaN(new Date(startDate).getTime()) ? undefined : new Date(startDate).toISOString()) : undefined,
        gameType:        gameType  || undefined,
        metric:          metric    || undefined,
        levels:          levels.length > 0 ? levels : undefined,
        bestOf,
        bestOfLosers: format === "double_elimination" && !useSameLosers ? bestOfLosers : null,
        winnerOnly,
        estimatedMatchMinutes,
        allowPlayerReg,
        isPublic,
        preferredSeason: preferredSeason || null,
        ...(format === "round_robin" ? { rrGroupSize, rrAdvancingTeams } : {}),
        ...(participantType === "equipos" ? { teamSize: teamSizeMax, teamSizeMin, metricPlayers } : {}),
        maxMetric: maxMetric ? parseFloat(maxMetric) : null,
      });
      toast.success("Configuración guardada");
      onSaved();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors) {
        const fields = Object.entries(data.errors as Record<string, string[]>)
          .map(([k, v]) => `${k}: ${v.join(", ")}`)
          .join(" · ");
        toast.error(`Error en: ${fields}`, { duration: 6000 });
      } else {
        toast.error(data?.message || "Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("¿Reiniciar el torneo? Se eliminarán todos los partidos y volverá al estado de inscripciones.")) return;
    setResetting(true);
    try {
      await api.post(`/tournaments/${tournament.id}/reset`);
      toast.success("Torneo reiniciado a inscripciones abiertas");
      onReset();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al reiniciar");
    } finally {
      setResetting(false);
    }
  };

  const [recalculating, setRecalculating] = useState(false);
  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.post(`/tournaments/${tournament.id}/recalculate-metrics`);
      toast.success("Métricas actualizadas — recarga la página para ver los cambios");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al recalcular métricas");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Read-only banner + reset button when in_progress ── */}
      {!canEdit && (
        <div className="flex items-center justify-between bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-300 font-medium">
            {tournament.status === "in_progress"
              ? "El torneo está en curso. Reinícialo para editar la configuración."
              : "El torneo ha finalizado. No se puede editar."}
          </p>
          {tournament.status === "in_progress" && (
            <button
              onClick={handleReset}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-all disabled:opacity-40 shrink-0 ml-4"
            >
              <RotateCcw className={clsx("w-3.5 h-3.5", resetting && "animate-spin")} />
              {resetting ? "Reiniciando…" : "Reiniciar torneo"}
            </button>
          )}
        </div>
      )}

      {/* ── 0. Visibilidad ── */}
      <div className={clsx(
        "rounded-2xl p-5 border flex items-center justify-between gap-4",
        isPublic
          ? "bg-green-900/15 border-green-700/50"
          : "bg-ink-900 border-ink-800"
      )}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={clsx("text-sm font-bold", isPublic ? "text-green-300" : "text-white")}>
              {isPublic ? "✓ Torneo publicado" : "Torneo privado"}
            </span>
            <span className={clsx(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
              isPublic ? "bg-green-900/40 text-green-400" : "bg-ink-800 text-ink-500"
            )}>
              {isPublic ? "Público" : "Privado"}
            </span>
          </div>
          <p className="text-xs text-ink-500 leading-relaxed">
            {isPublic
              ? "Los jugadores pueden ver este torneo en su listado."
              : "Solo los organizadores pueden ver este torneo. Publícalo cuando esté listo."}
          </p>
        </div>
        <button
          onClick={handleTogglePublic}
          disabled={togglingPublic || !canEdit && !isPublic}
          className={clsx(
            "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
            isPublic
              ? "bg-ink-800 border border-ink-700 text-ink-300 hover:bg-red-900/20 hover:text-red-400 hover:border-red-800/40"
              : "bg-green-600 hover:bg-green-500 text-white shadow-lg",
            (togglingPublic) && "opacity-50 cursor-not-allowed"
          )}
        >
          {togglingPublic ? (
            <><span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Guardando…</>
          ) : isPublic ? (
            "Ocultar torneo"
          ) : (
            "Publicar torneo →"
          )}
        </button>
      </div>

      {/* ── 1. Información básica ── */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-white text-xs uppercase tracking-wider">Información básica</h3>

        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">Nombre del torneo</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={!canEdit}
            className={inputCls}
            placeholder="Copa de Primavera 2026"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">Descripción</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={!canEdit}
            rows={2}
            className={inputCls + " resize-none"}
            placeholder="Describe el torneo…"
          />
        </div>

        {/* ── Foto del torneo ── */}
        <TournamentImageUpload
          tournamentId={tournament.id}
          currentImageUrl={imageUrl}
          onUpdated={setImageUrl}
        />

        {/* ── Tipo de torneo ── */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-400">Tipo de torneo</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([
              { value: "individual",     label: "Individual"     },
              { value: "parejas",        label: "Parejas"        },
              { value: "parejas_ciegas", label: "Parejas Ciegas" },
              { value: "trios",          label: "Tríos"          },
              { value: "equipos",        label: "Equipos"        },
            ] as const).map(opt => (
              <button key={opt.value} type="button"
                disabled={!canEdit}
                onClick={() => setParticipantType(opt.value)}
                className={clsx(
                  "flex items-center justify-center p-2.5 rounded-xl border text-sm font-semibold transition-all",
                  participantType === opt.value
                    ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20 text-white"
                    : "border-ink-700 text-ink-400 hover:border-ink-500 hover:text-white",
                  !canEdit && "opacity-40 cursor-not-allowed"
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* teamSizeMin + teamSizeMax + metricPlayers — solo Equipos */}
        {participantType === "equipos" && (
          <>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-ink-400">Jugadores por equipo</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Min */}
                <div className="bg-ink-950 border border-ink-700 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                    Mínimo <span className="text-red-400">*</span> requeridos
                  </p>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!canEdit || teamSizeMin <= 1}
                      onClick={() => setTeamSizeMin(v => Math.max(1, v - 1))}
                      className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">−</button>
                    <span className="flex-1 text-center text-white font-black text-xl tabular-nums">{teamSizeMin}</span>
                    <button type="button" disabled={!canEdit || teamSizeMin >= teamSizeMax}
                      onClick={() => setTeamSizeMin(v => Math.min(teamSizeMax, v + 1))}
                      className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">+</button>
                  </div>
                </div>
                {/* Max */}
                <div className="bg-ink-950 border border-ink-700 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">Máximo opcional</p>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={!canEdit || teamSizeMax <= teamSizeMin}
                      onClick={() => setTeamSizeMax(v => Math.max(teamSizeMin, v - 1))}
                      className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">−</button>
                    <span className="flex-1 text-center text-white font-black text-xl tabular-nums">{teamSizeMax}</span>
                    <button type="button" disabled={!canEdit || teamSizeMax >= 7}
                      onClick={() => setTeamSizeMax(v => Math.min(7, v + 1))}
                      className="w-7 h-7 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all text-sm">+</button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-ink-600">
                {teamSizeMin === teamSizeMax
                  ? `Equipos de exactamente ${teamSizeMin} jugadores`
                  : `${teamSizeMin} jugadores obligatorios + hasta ${teamSizeMax - teamSizeMin} opcionales`}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-ink-400">
                Jugadores para calcular la media
                <span className="ml-1 text-ink-600 font-normal">(los N mejores del equipo)</span>
              </label>
              <div className="flex gap-2">
                {[3, 4, 5, 6, 7].map(n => (
                  <button key={n} type="button"
                    disabled={!canEdit || n > teamSizeMax}
                    onClick={() => setMetricPlayers(n)}
                    className={clsx(
                      "flex-1 py-2 rounded-xl border text-sm font-bold transition-all",
                      metricPlayers === n ? "border-red-500/60 bg-red-900/15 text-white" : "border-ink-700 text-ink-400 hover:border-ink-500",
                      (n > teamSizeMax || !canEdit) && "opacity-30 cursor-not-allowed"
                    )}>{n}</button>
                ))}
              </div>
              <p className="text-[11px] text-ink-600">
                {metricPlayers === teamSizeMax
                  ? `Media de todos los jugadores del equipo`
                  : `Media de los ${metricPlayers} jugadores con mayor media del equipo`}
              </p>
            </div>
          </>
        )}

        {/* maxMetric */}
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">
            Límite de media máxima <span className="text-ink-600 font-normal">(opcional)</span>
          </label>
          <input type="number" value={maxMetric} onChange={e => setMaxMetric(e.target.value)}
            step="0.01" min="0" placeholder="Ej: 3.00 — vacío = sin límite"
            disabled={!canEdit} className={inputCls} />
          <p className="text-[11px] text-ink-500 mt-1">Los jugadores con media superior no podrán inscribirse.</p>
        </div>

        <SizeSelector
          label="Máx. participantes del torneo"
          value={maxParticipants}
          onChange={setMaxParticipants}
          disabled={!canEdit}
        />

        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">Fecha de inicio</label>
          <DateTimePicker
            value={startDate}
            onChange={setStartDate}
            disabled={!canEdit}
          />
        </div>
      </div>

      {/* ── 2. Modalidad de juego + Métrica ── */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
        <div className="grid grid-cols-3 gap-3">

          {/* título fila 1 */}
          <h3 className="col-span-3 font-bold text-white text-xs uppercase tracking-wider">Modalidad de juego</h3>

          <button type="button" disabled={!canEdit}
            onClick={() => { setGameType(gameType === "01" ? undefined : "01"); setMetric(gameType === "01" ? undefined : "ppd"); if (gameType === "01") setLevels([]); }}
            className={clsx("flex items-center justify-center p-3 rounded-xl border transition-all",
              gameType === "01" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-white">01</span>
          </button>
          <button type="button" disabled={!canEdit}
            onClick={() => { setGameType(gameType === "cricket" ? undefined : "cricket"); setMetric(gameType === "cricket" ? undefined : "mpr"); if (gameType === "cricket") setLevels([]); }}
            className={clsx("flex items-center justify-center p-3 rounded-xl border transition-all",
              gameType === "cricket" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-white">Cricket</span>
          </button>
          <button type="button" disabled={!canEdit}
            onClick={() => { setGameType(gameType === "combo" ? undefined : "combo"); setMetric(gameType === "combo" ? undefined : "combined"); if (gameType === "combo") setLevels([]); }}
            className={clsx("flex items-center justify-center p-3 rounded-xl border transition-all",
              gameType === "combo" ? "border-red-500/60 bg-red-900/15 ring-1 ring-red-500/20" : "border-ink-700 hover:border-ink-500",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-white text-center">Combo 01 & Cricket</span>
          </button>

          {/* título fila 2 */}
          <h3 className="col-span-3 font-bold text-white text-xs uppercase tracking-wider mt-2">Tipo de rating</h3>

          <button type="button" disabled={!canEdit}
            onClick={() => setMetric(metric === "ppd" ? undefined : "ppd")}
            className={clsx("flex items-center justify-center p-3 rounded-xl border transition-all",
              metric === "ppd" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-blue-400">PPD</span>
          </button>
          <button type="button" disabled={!canEdit}
            onClick={() => setMetric(metric === "mpr" ? undefined : "mpr")}
            className={clsx("flex items-center justify-center p-3 rounded-xl border transition-all",
              metric === "mpr" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-amber-400">MPR</span>
          </button>
          <button type="button" disabled={!canEdit}
            onClick={() => setMetric(metric === "combined" ? undefined : "combined")}
            className={clsx("flex flex-col items-center justify-center p-3 rounded-xl border transition-all gap-0.5",
              metric === "combined" ? "border-white/70 bg-ink-700" : "border-ink-600 hover:border-ink-400",
              !canEdit && "opacity-40 cursor-not-allowed")}>
            <span className="text-sm font-bold text-purple-400">Combinada</span>
            <span className="text-[10px] text-ink-500">PPD+(MPR×10)</span>
          </button>

        </div>

        {gameType && canEdit && (
          <button type="button"
            onClick={() => { setGameType(undefined); setMetric(undefined); setLevels([]); }}
            className="text-xs text-ink-500 hover:text-red-400 transition-colors mt-4 block">
            × Quitar modalidad
          </button>
        )}
      </div>

      {/* ── 3. Recalcular métricas (cuando hay métrica y participantes) ── */}
      {metric && tournament.participantsCount > 0 && (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", recalculating && "animate-spin")} />
            {recalculating ? "Recalculando…" : "Sincronizar métricas de participantes"}
          </button>
          <p className="text-[11px] text-ink-600 mt-1">
            Actualiza los valores de {metric.toUpperCase()} de todos los inscritos desde el histórico.
          </p>
        </div>
      )}

      {/* ── 4. Liga preferida + Niveles ── */}
      {metric && (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider">Niveles de competición</h3>
            <span className="text-xs text-ink-500">opcional</span>
          </div>
          <SeasonSelector
            value={preferredSeason}
            onChange={setPreferredSeason}
            disabled={!canEdit}
          />
          <LevelBuilder
            levels={levels}
            onChange={setLevels}
            metric={metric}
            format={format}
            disabled={!canEdit}
          />
        </div>
      )}

      {/* ── 5. Formato del bracket ── */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-white text-xs uppercase tracking-wider">Formato del bracket</h3>
        <div className="space-y-2">
          {FORMAT_OPTIONS.map(f => (
            <button
              key={f.value}
              type="button"
              disabled={!canEdit}
              onClick={() => handleFormatChange(f.value)}
              className={clsx(
                "w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left",
                format === f.value
                  ? "border-red-500/60 bg-red-900/15"
                  : "border-ink-700 hover:border-ink-600",
                !canEdit && "opacity-40 cursor-not-allowed"
              )}
            >
              <div className={clsx(
                "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                format === f.value ? "border-red-500" : "border-ink-600"
              )}>
                {format === f.value && <div className="w-2 h-2 rounded-full bg-red-500" />}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{f.label}</p>
                <p className="text-ink-400 text-xs mt-0.5">{f.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 5b. Round Robin config — only when format is round_robin ── */}
      {format === "round_robin" && (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-5">
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">Configuración de grupos</h3>

          {/* Jugadores por grupo */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-2">Jugadores por grupo</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canEdit || rrGroupSize <= 3}
                onClick={() => setRrGroupSize(v => Math.max(3, v - 1))}
                className="w-8 h-8 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all"
              >−</button>
              <span className="w-8 text-center text-white font-bold text-lg tabular-nums">{rrGroupSize}</span>
              <button
                type="button"
                disabled={!canEdit || rrGroupSize >= 8}
                onClick={() => setRrGroupSize(v => Math.min(8, v + 1))}
                className="w-8 h-8 rounded-lg bg-ink-800 border border-ink-700 text-white font-bold flex items-center justify-center disabled:opacity-30 hover:border-ink-500 transition-all"
              >+</button>
              <span className="text-xs text-ink-500 ml-1">jugadores · {rrGroupSize - 1} partidos por jugador</span>
            </div>
          </div>

          {/* Clasifican al KO */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-2">Clasifican al KO por grupo</label>
            <div className="flex gap-2">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={!canEdit || n >= rrGroupSize}
                  onClick={() => setRrAdvancingTeams(n)}
                  className={clsx(
                    "w-12 h-10 rounded-xl text-sm font-bold border transition-all",
                    rrAdvancingTeams === n
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-ink-800 border-ink-700 text-ink-300 hover:border-ink-500",
                    (n >= rrGroupSize) && "opacity-30 cursor-not-allowed"
                  )}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Formato de partidas (Best Of) — hidden when per-level configured ── */}
      {levels.length <= 1 ? (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-6">
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">Formato de partidas</h3>

          <BestOfSelector
            label={format === "double_elimination" ? "🏆 Lado de ganadores" : "Formato de partido"}
            value={bestOf}
            onChange={setBestOf}
            disabled={!canEdit}
          />

          {format === "double_elimination" && (
            <div className="space-y-3 pt-2 border-t border-ink-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setUseSameLosers(v => !v)}
                  className={clsx(
                    "relative w-9 h-5 rounded-full border transition-all shrink-0",
                    useSameLosers ? "bg-red-600 border-red-500" : "bg-ink-800 border-ink-600",
                    !canEdit && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <span className={clsx(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                    useSameLosers ? "left-4" : "left-0.5"
                  )} />
                </button>
                <span className="text-sm text-ink-300">
                  {useSameLosers ? "Lado de perdedores igual que ganadores" : "Lado de perdedores diferente"}
                </span>
              </div>
              {!useSameLosers && (
                <BestOfSelector
                  label="💀 Lado de perdedores"
                  value={bestOfLosers ?? bestOf}
                  onChange={v => setBestOfLosers(v)}
                  disabled={!canEdit}
                />
              )}
            </div>
          )}

          {/* Summary */}
          <div className="bg-ink-950 border border-ink-800 rounded-xl px-4 py-3 text-xs text-ink-400 space-y-1">
            <p>
              <span className="text-ink-300 font-semibold">
                {format === "double_elimination" ? "Ganadores:" : "Partidas:"}
              </span>{" "}
              Mejor de {bestOf} · <strong className="text-white">{Math.ceil(bestOf / 2)} legs</strong> para ganar
            </p>
            {format === "double_elimination" && (
              <p>
                <span className="text-ink-300 font-semibold">Perdedores:</span>{" "}
                {useSameLosers
                  ? `Igual que ganadores (BO${bestOf})`
                  : `Mejor de ${bestOfLosers ?? bestOf} · ${Math.ceil((bestOfLosers ?? bestOf) / 2)} legs para ganar`}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* When multiple levels: format is configured per level inside the level builder */
        <div className="bg-ink-900/40 border border-ink-800/60 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-ink-600 text-sm">📋</span>
          <p className="text-xs text-ink-500">
            El <strong className="text-ink-400">formato de partidas</strong> está configurado por nivel en la sección &ldquo;Niveles de competición&rdquo; de arriba.
            El ajuste global se aplica como fallback si un nivel no tiene formato propio.
          </p>
        </div>
      )}

      {/* ── 7. Solo comunicar el ganador ── */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-white uppercase tracking-wider">Solo comunicar el ganador</p>
            <p className="text-xs text-ink-500 mt-0.5">Sin introducción de resultado de legs — solo se selecciona quién ganó</p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setWinnerOnly(v => !v)}
            className={clsx(
              "relative w-9 h-5 rounded-full border transition-all shrink-0",
              winnerOnly ? "bg-red-600 border-red-500" : "bg-ink-800 border-ink-600",
              !canEdit && "opacity-40 cursor-not-allowed"
            )}
          >
            <span className={clsx(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
              winnerOnly ? "left-4" : "left-0.5"
            )} />
          </button>
        </div>

        {/* Estimated match time */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-ink-800">
          <div>
            <p className="text-xs font-semibold text-white uppercase tracking-wider">Tiempo estimado de partido</p>
            <p className="text-xs text-ink-500 mt-0.5">Alerta en Gestión si un partido lanzado supera este tiempo sin resultado</p>
          </div>
          <div className="flex items-center gap-0 bg-ink-950 border border-ink-700 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              disabled={!canEdit || estimatedMatchMinutes <= 5}
              onClick={() => setEstimatedMatchMinutes(v => Math.max(5, v - 5))}
              className="px-2 py-1.5 text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center px-3 min-w-[56px] border-x border-ink-700">
              <span className="text-sm font-bold text-white leading-tight">{estimatedMatchMinutes}</span>
              <span className="text-[9px] text-ink-600 leading-tight">min</span>
            </div>
            <button
              type="button"
              disabled={!canEdit || estimatedMatchMinutes >= 240}
              onClick={() => setEstimatedMatchMinutes(v => Math.min(240, v + 5))}
              className="px-2 py-1.5 text-ink-400 hover:text-white hover:bg-ink-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 8. Reglas (collapsible) ── */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRules(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4"
        >
          <h3 className="font-bold text-white text-xs uppercase tracking-wider">Reglas y notas</h3>
          {showRules
            ? <ChevronUp className="w-4 h-4 text-ink-500" />
            : <ChevronDown className="w-4 h-4 text-ink-500" />}
        </button>
        {showRules && (
          <div className="px-5 pb-5">
            <textarea
              value={rules}
              onChange={e => setRules(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className={inputCls + " resize-none"}
              placeholder="Especifica las reglas, horarios, sistema de puntuación…"
            />
          </div>
        )}
      </div>

      {/* ── 9. Inscripción pública para jugadores ── */}
      <div className="flex items-center justify-between p-4 bg-ink-800/50 rounded-xl border border-ink-700">
        <div>
          <p className="text-white text-sm font-semibold">Inscripción pública para jugadores</p>
          <p className="text-ink-500 text-xs mt-0.5">Los jugadores registrados podrán solicitar inscripción</p>
        </div>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setAllowPlayerReg(v => !v)}
          className={clsx(
            "w-11 h-6 rounded-full transition-colors relative shrink-0",
            allowPlayerReg ? "bg-red-600" : "bg-ink-700",
            !canEdit && "opacity-40 cursor-not-allowed"
          )}
        >
          <span className={clsx(
            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
            allowPlayerReg ? "left-6" : "left-1"
          )} />
        </button>
      </div>

      {/* ── Save button ── */}
      {canEdit && (
        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
            "bg-red-600 hover:bg-red-500 text-white shadow-red-sm",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      )}
    </div>
  );
}

function buildBracket(matches: Match[], format: string): Bracket {
  const roundNums = [...new Set(matches.filter(m => !m.bracketSide || m.bracketSide === "winners").map(m => m.round))].sort((a, b) => a - b);
  // WB regular rounds (exclude special round numbers 99 = GF, 100 = bracket reset)
  const wbRegularNums = roundNums.filter(r => r !== 99 && r !== 100);
  const totalWBRegular = wbRegularNums.length;

  const rounds: BracketRound[] = roundNums.map((round) => {
    let name: string;
    if (round === 100) {
      name = "Gran Final 2";
    } else if (round === 99) {
      name = "Gran Final";
    } else {
      const idx = totalWBRegular - round;
      name = idx >= 0 && idx < ROUND_NAMES.length ? ROUND_NAMES[idx] : `Ronda ${round}`;
    }
    return {
      round,
      name,
      matches: matches.filter(m => m.round === round && (!m.bracketSide || m.bracketSide === "winners")).sort((a, b) => a.position - b.position),
    };
  });

  const losersRoundNums = [...new Set(matches.filter(m => m.bracketSide === "losers").map(m => m.round))].sort((a, b) => a - b);
  const losersRounds: BracketRound[] = losersRoundNums.map((round) => ({
    round,
    name: `Ronda ${round}`,
    matches: matches.filter(m => m.round === round && m.bracketSide === "losers").sort((a, b) => a.position - b.position),
  }));

  return { tournamentId: matches[0]?.tournamentId ?? "", format: format as any, rounds, losersRounds };
}

/** Returns the ordered list of bracket levels present in matches.
 *  If the tournament uses levels, each level gets its own bracket.
 *  null means "SIN NIVEL" (participants that didn't match any level). */
function getBracketLevels(matches: Match[], tournamentLevels: { name: string; order: number }[]): Array<string | null> {
  const allLevelValues = new Set(matches.map(m => m.bracketLevel ?? null));
  // Sort by tournament level order, then null at end
  const named = tournamentLevels
    .filter(l => allLevelValues.has(l.name))
    .sort((a, b) => a.order - b.order)
    .map(l => l.name as string | null);
  if (allLevelValues.has(null)) named.push(null);
  return named;
}

type Tab = "bracket" | "participants" | "setup" | "standings" | "gestion";

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuthStore();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("bracket");
  const [activeBracketLevel, setActiveBracketLevel] = useState<string | null | undefined>(undefined); // undefined = not yet initialised
  const [reportMatch, setReportMatch] = useState<Match | null>(null);
  const [launchMatch, setLaunchMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);

  const { connected, onMatchUpdated, onTournamentUpdated } = useSocket(id);
  const router = useRouter();

  const isOrganizer = user && tournament && (user.id === tournament.createdBy || user.role === "admin" || user.role === "organizer");

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [tRes, pRes, mRes] = await Promise.all([
        api.get(`/tournaments/${id}`),
        api.get(`/tournaments/${id}/participants`),
        api.get(`/tournaments/${id}/matches`),
      ]);
      const t: Tournament = tRes.data.data;
      const m: Match[]    = mRes.data.data;
      setTournament(t);
      setParticipants(pRes.data.data);
      setMatches(m);
      // Auto-select first tournament level (started or not)
      setActiveBracketLevel(prev => {
        if (prev !== undefined) return prev; // already set by user
        if (t.levels && t.levels.length > 0) {
          const sorted = [...t.levels].sort((a, b) => a.order - b.order);
          return sorted[0].name;
        }
        const levelNames = getBracketLevels(m, t.levels ?? []);
        return levelNames[0] ?? null;
      });
    } catch {
      toast.error("Error cargando el torneo");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time match updates — reload all matches so bracket slots filled by
  // advancement logic (next-round participants) are also reflected
  useEffect(() => {
    const unsub = onMatchUpdated(async (updated: Match) => {
      // Optimistically update the reported match right away
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      // Then reload the full list to pick up advancement updates in other matches
      try {
        const mRes = await api.get(`/tournaments/${id}/matches`);
        setMatches(mRes.data.data);
      } catch { /* silent — optimistic update stays */ }
    });
    return unsub;
  }, [onMatchUpdated, id]);

  // Tournament lifecycle events (start, finalize, open registration) — reload all data
  useEffect(() => {
    const unsub = onTournamentUpdated(() => { loadData(); });
    return unsub;
  }, [onTournamentUpdated, loadData]);

  // Polling fallback: if socket is disconnected, poll every 15s when tournament
  // is active so the bracket appears without a manual page reload
  useEffect(() => {
    if (!tournament) return;
    if (tournament.status !== "registration" && tournament.status !== "in_progress") return;
    const interval = setInterval(() => { loadData(); }, 15_000);
    return () => clearInterval(interval);
  }, [tournament?.status, loadData]);

  // Organizer actions
  const handleOpenRegistration = async () => {
    try {
      await api.post(`/tournaments/${id}/open-registration`);
      toast.success("Inscripciones abiertas");
      loadData();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleStart = async () => {
    try {
      await api.post(`/tournaments/${id}/start`);
      toast.success("¡Torneo iniciado! Bracket generado.");
      loadData();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleFinalize = async () => {
    try {
      await api.post(`/tournaments/${id}/finalize`);
      toast.success("Torneo finalizado");
      loadData();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleRandomize = async () => {
    try {
      await api.post(`/tournaments/${id}/participants/randomize`);
      toast.success("Seeds aleatorizadas");
      const { data } = await api.get(`/tournaments/${id}/participants`);
      setParticipants(data.data);
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleJoin = async () => {
    if (!user) return;
    try {
      await api.post(`/tournaments/${id}/participants`, { entityId: user.id });
      toast.success("¡Te has inscrito en el torneo!");
      loadData();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  const handleRemoveParticipant = async (participantId: string) => {
    try {
      await api.delete(`/tournaments/${id}/participants/${participantId}`);
      toast.success("Participante eliminado");
      loadData();
    } catch (err: any) { toast.error(err.response?.data?.message || "Error"); }
  };

  // ── Edit participant metric ──────────────────────────────────────────────────
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editMetricValue,    setEditMetricValue]    = useState("");
  const [editSaving,         setEditSaving]         = useState(false);

  const openEditModal = (p: Participant) => {
    setEditingParticipant(p);
    setEditMetricValue(p.metricValue != null ? String(p.metricValue) : "");
  };

  const handleSaveMetric = async () => {
    if (!editingParticipant) return;
    setEditSaving(true);
    try {
      const val = editMetricValue.trim() === "" ? null : parseFloat(editMetricValue);
      await api.patch(`/tournaments/${id}/participants/${editingParticipant.id}/metric`, {
        metricValue: (val != null && !isNaN(val)) ? val : null,
      });
      toast.success("Media actualizada");
      setEditingParticipant(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setEditSaving(false);
    }
  };

  const [startingLevel,  setStartingLevel]  = useState<string | null>(null);
  const [resettingLevel, setResettingLevel] = useState<string | null>(null);

  const handleResetLevel = async (levelName: string) => {
    if (!window.confirm(`¿Regenerar el nivel "${levelName}"?\nSe borrarán todos los resultados de este nivel y se volverá a generar el cuadrante con la asignación de participantes correcta.`)) return;
    setResettingLevel(levelName);
    try {
      const res = await api.post(`/tournaments/${id}/reset-level`, { levelName });
      toast.success(res.data?.message ?? `Nivel "${levelName}" regenerado`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al regenerar el nivel");
    } finally {
      setResettingLevel(null);
    }
  };

  const handleStartLevel = async (levelName: string) => {
    if (!window.confirm(`¿Iniciar el nivel "${levelName}"? Los jugadores de este nivel quedarán bloqueados en el cuadrante.`)) return;
    setStartingLevel(levelName);
    try {
      await api.post(`/tournaments/${id}/start-level`, { levelName });
      toast.success(`¡Nivel "${levelName}" iniciado! Bracket generado.`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al iniciar el nivel");
    } finally {
      setStartingLevel(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar el torneo "${tournament?.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/tournaments/${id}`);
      toast.success("Torneo eliminado");
      router.push("/tournaments");
    } catch (err: any) { toast.error(err.response?.data?.message || "Error al eliminar el torneo"); }
  };

  // ── Player self-inscription state ───────────────────────────────────────────
  const [playerInscriptionStatus, setPlayerInscriptionStatus] = useState<"none" | "pending" | "confirmed" | "loading">("none");

  // Determine player inscription status from participants list
  useEffect(() => {
    if (user?.role !== "player") return;
    const mine = participants.find(p => (p.user as any)?.id === user.id || (p as any).userId === user.id);
    if (!mine) {
      setPlayerInscriptionStatus("none");
    } else if ((mine as any).inscriptionStatus === "confirmed") {
      setPlayerInscriptionStatus("confirmed");
    } else {
      setPlayerInscriptionStatus("pending");
    }
  }, [participants, user]);

  const handlePlayerInscribe = async () => {
    setPlayerInscriptionStatus("loading");
    try {
      await api.post(`/tournaments/${id}/player-inscribe`);
      toast.success("Solicitud enviada. Pendiente de aprobación del organizador.");
      setPlayerInscriptionStatus("pending");
      loadData();
    } catch (err: any) {
      setPlayerInscriptionStatus("none");
      toast.error(err.response?.data?.message || "Error al inscribirse");
    }
  };

  // ── Pending inscriptions (organizer) ────────────────────────────────────────
  const [pendingInscriptions, setPendingInscriptions] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const loadPendingInscriptions = async () => {
    if (!isOrganizer) return;
    setLoadingPending(true);
    try {
      const { data } = await api.get(`/tournaments/${id}/pending-inscriptions`);
      setPendingInscriptions(data.data);
    } catch {
      // ignore
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    if (activeTab === "participants" && isOrganizer) {
      loadPendingInscriptions();
    }
  }, [activeTab, isOrganizer]);

  // ── Approve modal state ─────────────────────────────────────────────────────
  const [approvingInsc, setApprovingInsc] = useState<any | null>(null);
  const [approveMetric, setApproveMetric] = useState("");  // used for ppd/mpr single-field
  const [approvePpd,    setApprovePpd]    = useState("");  // used when metric = combined
  const [approveMpr,    setApproveMpr]    = useState("");  // used when metric = combined
  const [approving,     setApproving]     = useState(false);

  // Combined value derived from PPD + MPR (formula: mpr*10 + ppd)
  const approveComputed = (() => {
    const ppd = parseFloat(approvePpd);
    const mpr = parseFloat(approveMpr);
    if (isNaN(ppd) && isNaN(mpr)) return null;
    return ((isNaN(mpr) ? 0 : mpr) * 10) + (isNaN(ppd) ? 0 : ppd);
  })();

  const openApproveModal = (insc: any) => {
    const metric = tournament?.metric;
    if (metric === "combined") {
      // Pre-fill from historic PPD/MPR if available
      setApprovePpd(insc.historicMetric?.ppd != null ? String(insc.historicMetric.ppd.toFixed(2)) : "");
      setApproveMpr(insc.historicMetric?.mpr != null ? String(insc.historicMetric.mpr.toFixed(2)) : "");
      setApproveMetric("");
    } else {
      const suggested = insc.historicMetric?.value != null
        ? String(insc.historicMetric.value.toFixed(2))
        : insc.metricValue != null ? String(insc.metricValue) : "";
      setApproveMetric(suggested);
      setApprovePpd(""); setApproveMpr("");
    }
    setApprovingInsc(insc);
  };

  const handleResolveInscription = async (participantId: string, action: "approve" | "reject", metricValue?: number | null) => {
    try {
      await api.patch(`/tournaments/${id}/inscriptions/${participantId}`, {
        action,
        ...(metricValue != null ? { metricValue } : {}),
      });
      toast.success(action === "approve" ? "Inscripción aprobada" : "Inscripción rechazada");
      setApprovingInsc(null);
      await loadPendingInscriptions();
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al procesar la inscripción");
    }
  };

  const handleConfirmApprove = async () => {
    if (!approvingInsc) return;
    setApproving(true);
    let mv: number | null;
    if (tournament?.metric === "combined") {
      mv = approveComputed;
    } else {
      mv = approveMetric.trim() ? parseFloat(approveMetric.trim()) : null;
    }
    await handleResolveInscription(approvingInsc.id, "approve", mv);
    setApproving(false);
  };

  const [repairingBracket, setRepairingBracket] = useState(false);
  const handleRepairBracket = async () => {
    setRepairingBracket(true);
    try {
      await api.post(`/tournaments/${id}/repair-bracket`);
      toast.success("Cuadrante reparado — resultados propagados");
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al reparar");
    } finally {
      setRepairingBracket(false);
    }
  };

  const [resettingBracket, setResettingBracket] = useState(false);
  const handleResetBracket = async () => {
    if (!window.confirm("¿Reiniciar todos los cuadrantes? Se eliminarán todos los partidos y el torneo volverá a inscripciones.")) return;
    setResettingBracket(true);
    try {
      await api.post(`/tournaments/${id}/reset`);
      toast.success("Cuadrantes reiniciados");
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al reiniciar");
    } finally {
      setResettingBracket(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!tournament) return <div className="text-center text-gray-400 py-20">Torneo no encontrado</div>;

  // Multi-level bracket support
  const bracketLevels = getBracketLevels(matches, tournament.levels ?? []);
  const isMultiLevel = bracketLevels.length > 1 || (bracketLevels.length === 1 && bracketLevels[0] !== null);
  const currentBracketLevel = activeBracketLevel; // undefined = not initialised yet
  const bracketMatches = isMultiLevel
    ? matches.filter(m => (m.bracketLevel ?? null) === (currentBracketLevel ?? null))
    : matches;
  const bracket = bracketMatches.length > 0 ? buildBracket(bracketMatches, tournament.format) : null;

  const isRegistered = participants.some(p => p.user?.id === user?.id || p.team?.id === user?.id);
  const canJoin = !isRegistered && tournament.status === "registration" && user && !isOrganizer;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/tournaments" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a torneos
      </Link>

      {/* Header */}
      <div className="card overflow-hidden p-0">
        {/* Banner image — blurred backdrop + contain so A4 posters show fully */}
        {tournament.imageUrl && (() => {
          const src = `${process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "http://localhost:4000"}${tournament.imageUrl}`;
          return (
            <div className="relative w-full overflow-hidden" style={{ maxHeight: "380px", minHeight: "180px" }}>
              {/* Blurred fill layer */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-40 pointer-events-none select-none" />
              {/* Actual image — contains fully so portrait/A4 never gets cropped */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={tournament.name}
                className="relative z-10 mx-auto block max-w-full"
                style={{ maxHeight: "380px", objectFit: "contain" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
            </div>
          );
        })()}
        <div className={clsx("flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4", tournament.imageUrl ? "p-6" : "p-6")}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full", STATUS_STYLES[tournament.status])}>
                {STATUS_LABELS[tournament.status]}
              </span>
              <span className="text-xs text-gray-500 bg-gray-800 px-2.5 py-1 rounded-full">
                {FORMAT_LABELS[tournament.format]}
              </span>
              {connected && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> En vivo
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
            {tournament.description && <p className="text-gray-400">{tournament.description}</p>}

            <div className="flex items-center gap-5 text-sm text-gray-400 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {tournament.participantsCount}/{tournament.maxParticipants} participantes
              </span>
              {tournament.startDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(tournament.startDate), "d MMMM yyyy, HH:mm", { locale: es })}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4" />
                por {tournament.organizer.name}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 min-w-fit">
            {/* Player self-inscription button */}
            {user?.role === "player" && (tournament as any).allowPlayerReg && tournament.status === "registration" && (() => {
              if (playerInscriptionStatus === "loading") {
                return <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</div>;
              }
              if (playerInscriptionStatus === "pending") {
                return <div className="flex items-center gap-2 text-sm text-amber-400"><Clock className="w-4 h-4" /> Solicitud pendiente</div>;
              }
              if (playerInscriptionStatus === "confirmed") {
                return <div className="flex items-center gap-2 text-sm text-green-400"><CheckCircle className="w-4 h-4" /> Inscrito</div>;
              }
              return (
                <button onClick={handlePlayerInscribe} className="btn-primary flex items-center gap-2 whitespace-nowrap shadow-red-glow">
                  <UserPlus className="w-4 h-4" /> Inscribirme
                </button>
              );
            })()}

            {canJoin && user?.role !== "player" && (
              <button onClick={handleJoin} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                <UserPlus className="w-4 h-4" /> Inscribirse
              </button>
            )}
            {isRegistered && tournament.status === "registration" && user?.role !== "player" && (
              <div className="text-green-400 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Inscrito
              </div>
            )}

            {isOrganizer && (
              <>
                {tournament.status === "draft" && (
                  <button onClick={handleOpenRegistration} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                    <UserPlus className="w-4 h-4" /> Abrir inscripciones
                  </button>
                )}
                {/* "Aleatorizar seeds" and "Iniciar torneo" live in the Bracket tab */}
                {tournament.status === "in_progress" && (
                  <button onClick={handleFinalize} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
                    <CheckCircle className="w-4 h-4" /> Finalizar torneo
                  </button>
                )}

                {/* Repair bracket — re-propagates all existing results into empty slots */}
                {isOrganizer && matches.length > 0 && (tournament.status === "in_progress" || tournament.status === "registration") && (
                  <button
                    onClick={handleRepairBracket}
                    disabled={repairingBracket}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-800/50
                               text-blue-400 hover:bg-blue-900/30 hover:border-blue-600/60 transition-all whitespace-nowrap disabled:opacity-40"
                  >
                    <RefreshCw className={clsx("w-3.5 h-3.5", repairingBracket && "animate-spin")} />
                    {repairingBracket ? "Actualizando…" : "Actualizar cuadrante"}
                  </button>
                )}

                {/* Regenerate level — recalculates participant assignment and rebuilds bracket */}
                {isOrganizer && currentBracketLevel && matches.some(m => m.bracketLevel === currentBracketLevel) && (tournament.status === "in_progress" || tournament.status === "registration") && (
                  <button
                    onClick={() => handleResetLevel(currentBracketLevel)}
                    disabled={resettingLevel === currentBracketLevel}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-800/50
                               text-orange-400 hover:bg-orange-900/30 hover:border-orange-600/60 transition-all whitespace-nowrap disabled:opacity-40"
                    title="Regenera el cuadrante de este nivel recalculando qué jugadores le pertenecen"
                  >
                    <RefreshCw className={clsx("w-3.5 h-3.5", resettingLevel === currentBracketLevel && "animate-spin")} />
                    {resettingLevel === currentBracketLevel ? "Regenerando…" : `Regenerar ${currentBracketLevel}`}
                  </button>
                )}

                {/* Reset bracket — visible whenever matches exist (partial or full start) */}
                {matches.length > 0 && (tournament.status === "registration" || tournament.status === "in_progress") && (
                  <button
                    onClick={handleResetBracket}
                    disabled={resettingBracket}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-800/50
                               text-amber-400 hover:bg-amber-900/30 hover:border-amber-600/60 transition-all whitespace-nowrap disabled:opacity-40"
                  >
                    <RotateCcw className={clsx("w-3.5 h-3.5", resettingBracket && "animate-spin")} />
                    {resettingBracket ? "Reiniciando…" : "Reiniciar cuadrantes"}
                  </button>
                )}

                {/* Delete — available in all statuses except in_progress */}
                {tournament.status !== "in_progress" && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-800/50
                               text-red-400 hover:bg-red-900/30 hover:border-red-600/60 hover:text-red-300 transition-all whitespace-nowrap mt-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar torneo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 w-fit">
        {([
          ...(isOrganizer ? [{ id: "setup",        label: "Configuración",                          icon: Settings2     }] : []),
          { id: "participants", label: `Participantes (${participants.length})`,                   icon: Users         },
          { id: "bracket",      label: "Bracket",                                                  icon: Network       },
          ...(isOrganizer ? [{ id: "gestion",     label: "Gestión",                               icon: Target        }] : []),
          ...(isOrganizer || tournament.status === "completed" ? [{ id: "standings", label: "Resultados", icon: BarChart2 }] : []),
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative",
              activeTab === tabId ? "bg-primary-600 text-white" : "text-gray-400 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {/* Pending inscription badge */}
            {tabId === "participants" && isOrganizer && pendingInscriptions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                {pendingInscriptions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "bracket" && (() => {
        // ── Round Robin + KO format ──────────────────────────────────────────────
        if (tournament.format === "round_robin") {
          const hasLevels = (tournament.levels?.length ?? 0) > 0;

          // For multi-level RR: filter by the active level
          const currentLevel = hasLevels
            ? (activeBracketLevel ?? (tournament.levels?.length ? [...tournament.levels].sort((a,b)=>a.order-b.order)[0].name : null))
            : null;

          const rrMatches  = matches.filter(m => m.rrGroup != null   && (hasLevels ? (m.bracketLevel ?? null) === currentLevel : true));
          const koMatches  = matches.filter(m => m.rrGroup == null   && m.bracketSide === "winners"
                                              && (hasLevels ? (m.bracketLevel ?? null) === currentLevel : true));
          const koBracket  = koMatches.length > 0 ? buildBracket(koMatches, "single_elimination") : null;

          // Determine if ANY match exists for the current level (used to decide "no groups yet" state)
          const levelHasAnyMatches = hasLevels
            ? matches.some(m => (m.bracketLevel ?? null) === currentLevel)
            : matches.length > 0;

          const handleResetKOForLevel = async () => {
            if (!window.confirm("¿Reiniciar el cuadro KO? Se borrarán todos los partidos KO y podrás volver a generarlo. Los grupos de Round Robin no se verán afectados.")) return;
            try {
              const payload = currentLevel != null ? { bracketLevel: currentLevel } : {};
              await api.post(`/tournaments/${id}/reset-ko`, payload);
              toast.success("Cuadro KO reiniciado");
              loadData();
            } catch (err: any) {
              toast.error(err.response?.data?.message || "Error al reiniciar el KO");
            }
          };

          return (
            <div className="space-y-4">
              {/* Level tabs for multi-level RR */}
              {hasLevels && (
                <div className="flex items-center gap-2 flex-wrap">
                  {[...(tournament.levels ?? [])].sort((a, b) => a.order - b.order).map((lvl, li) => {
                    const pal          = LEVEL_PALETTE[li % LEVEL_PALETTE.length];
                    const isActive     = currentLevel === lvl.name;
                    const hasRR        = matches.some(m => m.bracketLevel === lvl.name && m.rrGroup != null);
                    const hasKOForLvl  = matches.some(m => m.bracketLevel === lvl.name && m.rrGroup == null);
                    return (
                      <button
                        key={lvl.id}
                        onClick={() => setActiveBracketLevel(lvl.name)}
                        className={clsx(
                          "flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm transition-all",
                          isActive
                            ? `${pal.bg} ${pal.border} ${pal.text}`
                            : "border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600 bg-ink-900"
                        )}
                      >
                        <span className={clsx("w-2.5 h-2.5 rounded-full shrink-0", hasRR ? pal.badge : "bg-ink-700")} />
                        {lvl.name}
                        {hasKOForLvl && <span className="text-[10px] opacity-60 ml-0.5">+KO</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* RR groups phase */}
              {rrMatches.length > 0 || (tournament.status === "in_progress" && levelHasAnyMatches) ? (
                <RRView
                  tournament={tournament}
                  matches={rrMatches}
                  participants={participants}
                  isOrganizer={!!isOrganizer}
                  bracketLevel={currentLevel}
                  hasKO={!!koBracket}
                  onReport={(match) => {
                    if (match.status === "completed" || match.launch1At) { setReportMatch(match); }
                    else { setLaunchMatch(match); }
                  }}
                  onDataChange={loadData}
                />
              ) : (
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-8 text-center text-gray-400">
                  <Network className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                  <p className="font-medium">La fase de grupos se generará cuando se inicie {hasLevels ? `el nivel "${currentLevel}"` : "el torneo"}</p>
                  {isOrganizer && tournament.status === "registration" && participants.length >= 2 && !hasLevels && (
                    <button onClick={handleStart} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
                      <Play className="w-4 h-4" /> Iniciar y generar grupos
                    </button>
                  )}
                  {isOrganizer && tournament.status === "registration" && hasLevels && currentLevel && (
                    <button
                      onClick={() => handleStartLevel(currentLevel)}
                      disabled={startingLevel === currentLevel}
                      className="btn-primary mt-4 flex items-center gap-2 mx-auto"
                    >
                      {startingLevel === currentLevel
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Iniciando…</>
                        : <><Play className="w-4 h-4" /> Iniciar {currentLevel}</>
                      }
                    </button>
                  )}
                </div>
              )}

              {/* KO bracket (shown once generated) */}
              {koBracket && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Network className="w-3.5 h-3.5 text-orange-400" />
                      Cuadro KO{hasLevels && currentLevel ? ` · ${currentLevel}` : ""}
                    </h3>
                    {isOrganizer && (
                      <button
                        type="button"
                        onClick={handleResetKOForLevel}
                        className="flex items-center gap-1.5 text-xs font-semibold text-ink-400 bg-ink-800 hover:bg-red-900/30 hover:text-red-400 border border-ink-700 hover:border-red-800/50 px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reiniciar KO
                      </button>
                    )}
                  </div>
                  <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 overflow-auto">
                    <BracketView
                      bracket={koBracket}
                      onReport={(match) => {
                        if (match.status === "completed" || match.launch1At) { setReportMatch(match); }
                        else { setLaunchMatch(match); }
                      }}
                      canReport={!!isOrganizer && (tournament.status === "in_progress" || tournament.status === "registration")}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        }

        // ── Standard bracket formats ─────────────────────────────────────────────
        const tabLevels = (tournament.levels ?? []).length > 0
          ? [...(tournament.levels ?? [])].sort((a, b) => a.order - b.order)
          : null;
        const startedSet = new Set(matches.map(m => m.bracketLevel).filter(Boolean) as string[]);
        const selectedIsStarted = currentBracketLevel != null && startedSet.has(currentBracketLevel);
        const selectedLevelObj  = tabLevels?.find(l => l.name === currentBracketLevel);
        const selectedLevelCount = selectedLevelObj
          ? participants.filter(p => {
              const assigned = assignLevel(p.metricValue, tournament.levels ?? []);
              return assigned?.id === selectedLevelObj.id;
            }).length
          : 0;

        return (
          <div className="space-y-3">
            {/* Level tabs — show ALL configured levels */}
            {tabLevels && tabLevels.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {tabLevels.map((lvl, li) => {
                  const pal      = LEVEL_PALETTE[li % LEVEL_PALETTE.length];
                  const started  = startedSet.has(lvl.name);
                  const isActive = currentBracketLevel === lvl.name;
                  const playerCount = started
                    ? matches.filter(
                        m => m.bracketLevel === lvl.name &&
                             m.round === 1 && (!m.bracketSide || m.bracketSide === "winners")
                      ).reduce((n, m) => n + (m.status === "bye" ? 1 : 2), 0)
                    : participants.filter(p => {
                        const assigned = assignLevel(p.metricValue, tournament.levels ?? []);
                        return assigned?.id === lvl.id;
                      }).length;

                  return (
                    <button
                      key={lvl.id}
                      onClick={() => setActiveBracketLevel(lvl.name)}
                      className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm transition-all",
                        isActive
                          ? `${pal.bg} ${pal.border} ${pal.text}`
                          : started
                            ? "border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600 bg-ink-900"
                            : "border-ink-800 text-ink-600 hover:text-ink-400 hover:border-ink-700 bg-ink-950"
                      )}
                    >
                      <span className={clsx(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        started ? pal.badge : "bg-ink-700"
                      )} />
                      {lvl.name}
                      <span className={clsx("text-xs font-normal", isActive ? pal.count : "text-ink-600")}>
                        {playerCount}j
                      </span>
                      {!started && (
                        <span className="text-[10px] text-ink-700 font-normal">Sin iniciar</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 overflow-auto" style={{ minHeight: 300 }}>
              {/* Selected level hasn't started yet — show start button */}
              {!bracket && isOrganizer && currentBracketLevel && !selectedIsStarted && tournament.status === "registration" ? (
                <div className="text-center py-16 text-gray-400 space-y-4">
                  <Network className="w-10 h-10 mx-auto text-gray-700" />
                  <div>
                    <p className="font-semibold text-white">{currentBracketLevel}</p>
                    <p className="text-sm text-ink-400 mt-1">
                      {selectedLevelCount} jugador{selectedLevelCount !== 1 ? "es" : ""} inscrito{selectedLevelCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleStartLevel(currentBracketLevel)}
                    disabled={selectedLevelCount < 2 || startingLevel === currentBracketLevel}
                    className={clsx(
                      "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all mx-auto",
                      selectedLevelCount >= 2
                        ? "bg-red-600 hover:bg-red-500 text-white"
                        : "bg-ink-800 text-ink-600 cursor-not-allowed"
                    )}
                    title={selectedLevelCount < 2 ? "Necesita al menos 2 participantes" : undefined}
                  >
                    {startingLevel === currentBracketLevel
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Iniciando…</>
                      : <><Play className="w-4 h-4" /> Iniciar {currentBracketLevel}</>
                    }
                  </button>
                  {selectedLevelCount < 2 && (
                    <p className="text-xs text-ink-600">Necesita al menos 2 participantes para generar un cuadrante</p>
                  )}
                </div>
              ) : !bracket ? (
                <div className="text-center py-16 text-gray-400">
                  <Network className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                  <p className="font-medium">El bracket se generará cuando el torneo inicie</p>
                  {isOrganizer && tournament.status === "registration" && (
                    <div className="flex flex-col items-center gap-2 mt-4">
                      {participants.length >= 2 && (
                        <button onClick={handleRandomize} className="btn-secondary flex items-center gap-2">
                          <Shuffle className="w-4 h-4" /> Aleatorizar seeds
                        </button>
                      )}
                      {participants.length >= 2 && (tournament.levels?.length ?? 0) === 0 && (
                        <button onClick={handleStart} className="btn-primary flex items-center gap-2">
                          <Play className="w-4 h-4" /> Iniciar y generar bracket
                        </button>
                      )}
                      {participants.length < 2 && (
                        <p className="text-xs text-ink-600 mt-1">Necesita al menos 2 participantes para iniciar</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <BracketView
                  bracket={bracket}
                  onReport={(match) => {
                    if (match.status === "completed" || match.launch1At) {
                      setReportMatch(match); // completed or already launched → edit/reset result
                    } else {
                      setLaunchMatch(match); // not yet launched → assign diana + launch
                    }
                  }}
                  canReport={!!isOrganizer && (tournament.status === "in_progress" || tournament.status === "registration")}
                />
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === "participants" && (
        <div className="space-y-4">
          {/* ── Per-level start panel (organizer, has levels, registration open) ── */}
          {isOrganizer && tournament.status === "registration" && (tournament.levels?.length ?? 0) > 0 && (
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-xs uppercase tracking-wider">Iniciar niveles</h3>
                {tournament.metric && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await api.post(`/tournaments/${id}/recalculate-metrics`);
                        toast.success("Métricas actualizadas");
                        loadData();
                      } catch (err: any) {
                        toast.error(err.response?.data?.message || "Error al recalcular");
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sincronizar métricas
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {(tournament.levels ?? []).map((level, li) => {
                  const pal = LEVEL_PALETTE[li % LEVEL_PALETTE.length];
                  const levelCount = participants.filter(p => {
                    const assigned = assignLevel(p.metricValue, tournament.levels ?? []);
                    return assigned?.id === level.id;
                  }).length;
                  const isStarted = matches.some(m => m.bracketLevel === level.name);
                  const canStart  = !isStarted && levelCount >= 2;

                  return (
                    <div key={level.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-ink-800 bg-ink-950/50">
                      <div className="flex items-center gap-3">
                        <span className={clsx("text-xs font-black px-2.5 py-1 rounded-lg text-white", pal.badge)}>
                          {level.name.toUpperCase()}
                        </span>
                        <span className="text-sm text-ink-300">
                          {levelCount} jugador{levelCount !== 1 ? "es" : ""}
                        </span>
                        {isStarted ? (
                          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                            En curso
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-500">Inscripciones abiertas</span>
                        )}
                      </div>
                      {isStarted ? (
                        <button
                          onClick={() => handleResetLevel(level.name)}
                          disabled={resettingLevel === level.name}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-900/40 hover:bg-amber-800/50 text-amber-400 border border-amber-700/40"
                          title="Regenerar cuadrante de este nivel"
                        >
                          {resettingLevel === level.name
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Regenerando…</>
                            : <><RefreshCw className="w-3.5 h-3.5" /> Regenerar</>
                          }
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartLevel(level.name)}
                          disabled={!canStart || startingLevel === level.name}
                          className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                            canStart
                              ? "bg-red-600 hover:bg-red-500 text-white"
                              : "bg-ink-800 text-ink-600 cursor-not-allowed"
                          )}
                          title={!canStart ? "Necesita al menos 2 participantes" : undefined}
                        >
                          {startingLevel === level.name
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Iniciando…</>
                            : <><Play className="w-3.5 h-3.5" /> Iniciar</>
                          }
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Also allow starting all at once */}
              {matches.length === 0 && participants.length >= 2 && (
                <button
                  onClick={handleStart}
                  className="w-full text-xs text-ink-500 hover:text-ink-300 transition-colors pt-1"
                >
                  Iniciar todos los niveles a la vez →
                </button>
              )}
            </div>
          )}

          {/* ── Pending player inscriptions (organizer only) ── */}
          {isOrganizer && (pendingInscriptions.length > 0 || loadingPending) && (
            <div className="bg-ink-900 border border-amber-800/40 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider">Solicitudes de inscripción</h3>
                  {pendingInscriptions.length > 0 && (
                    <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {pendingInscriptions.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={loadPendingInscriptions}
                  disabled={loadingPending}
                  className="text-ink-500 hover:text-ink-300 transition-colors"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", loadingPending && "animate-spin")} />
                </button>
              </div>
              {loadingPending ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-ink-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingInscriptions.map((insc: any) => {
                    const isOrphaned = !insc.user;
                    return (
                    <div key={insc.id}
                      className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border ${isOrphaned ? "bg-red-950/20 border-red-800/40" : "bg-ink-800/50 border-ink-700"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isOrphaned ? (
                            <p className="text-red-400 font-semibold text-sm truncate italic">Usuario eliminado</p>
                          ) : (
                            <p className="text-white font-semibold text-sm truncate">{insc.user.name}</p>
                          )}
                          {insc.inscriptionStatus === "pending_web" && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-600/40 text-blue-300 shrink-0">
                              🌐 Web
                            </span>
                          )}
                        </div>
                        {isOrphaned ? (
                          <p className="text-red-600 text-xs italic">La cuenta fue eliminada — solo se puede rechazar</p>
                        ) : (
                          <>
                            <p className="text-ink-500 text-xs truncate">{insc.user.email}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {insc.user.dni && (
                                <span className="text-[11px] text-ink-400 font-mono">{insc.user.dni}</span>
                              )}
                              {insc.user.phone && (
                                <a href={`tel:${insc.user.phone}`}
                                  className="inline-flex items-center gap-1 text-[11px] text-green-400 font-semibold hover:text-green-300 transition-colors">
                                  📞 {insc.user.phone}
                                </a>
                              )}
                              {insc.user.province && (
                                <span className="text-[11px] text-ink-400">{insc.user.province}</span>
                              )}
                              {/* Historic metric from PlayerRecord */}
                              {insc.historicMetric?.value != null ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-900/20 border border-amber-700/30 px-1.5 py-0.5 rounded">
                                  {insc.historicMetric.metricKey?.toUpperCase()} {insc.historicMetric.value.toFixed(2)}
                                  {insc.historicMetric.level && <span className="text-amber-400 font-normal">· {insc.historicMetric.level}</span>}
                                </span>
                              ) : (
                                <span className="text-[11px] text-ink-500 italic">Sin media en historial</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {!isOrphaned && (
                          <button
                            onClick={() => openApproveModal(insc)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-700 hover:bg-green-600 text-white transition-colors"
                          >
                            Aprobar
                          </button>
                        )}
                        <button
                          onClick={() => handleResolveInscription(insc.id, "reject")}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-800 hover:bg-red-700 text-white transition-colors"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Inscription panel (organizer only, registration open) ── */}
          {isOrganizer && tournament.status === "registration" && (
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
              <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-5">
                Gestión de inscripciones
              </h3>
              {(() => {
                // Effective max metric: explicit field OR max of level upper bounds
                const levelMaxVals = (tournament.levels ?? [])
                  .map((l: { maxValue?: number | null }) => l.maxValue)
                  .filter((v): v is number => v != null);
                const effectiveMax = tournament.maxMetric ??
                  (levelMaxVals.length > 0 ? Math.max(...levelMaxVals) : null);
                return (
                  <InscriptionPanel
                    tournamentId={id}
                    participantType={tournament.participantType}
                    maxParticipants={tournament.maxParticipants}
                    currentCount={participants.length}
                    registeredUserIds={new Set(participants.map(p => p.user?.id).filter(Boolean) as string[])}
                    onInscribed={() => loadData()}
                    gameType={tournament.gameType ?? undefined}
                    metric={tournament.metric ?? undefined}
                    maxMetric={effectiveMax}
                    preferredSeason={(tournament as any).preferredSeason ?? null}
                    teamSize={tournament.teamSize ?? null}
                    teamSizeMin={tournament.teamSizeMin ?? null}
                    metricPlayers={tournament.metricPlayers ?? null}
                    levels={tournament.levels ?? []}
                  />
                );
              })()}
            </div>
          )}

          {/* ── Participants list ── */}
          <ParticipantsList
            tournament={tournament}
            participants={participants}
            user={user}
            isOrganizer={!!isOrganizer}
            startedLevels={new Set(matches.map(m => m.bracketLevel).filter(Boolean) as string[])}
            onRemove={handleRemoveParticipant}
            onEdit={isOrganizer ? openEditModal : undefined}
            onPaymentToggle={async (participantId, status, method) => {
              try {
                await api.patch(`/tournaments/${id}/participants/${participantId}/payment`, {
                  paymentStatus: status,
                  paymentMethod: method ?? null,
                });
                loadData();
              } catch (err: any) {
                toast.error(err.response?.data?.message || "Error al actualizar pago");
              }
            }}
          />
        </div>
      )}

{activeTab === "standings" && (() => {
        // Build standings per level (same logic as bracket level tabs)
        const standingLevels = bracketLevels.length > 0 ? bracketLevels : [null];
        return (
          <div className="space-y-8">
            {standingLevels.map(lvl => {
              const lvlName = lvl ?? (isMultiLevel ? "Sin nivel" : null);
              const lvlParticipants = isMultiLevel && lvl !== null
                ? participants.filter(p => {
                    // Participants whose matches appear in this level
                    const inLevel = matches.some(
                      m => (m.bracketLevel ?? null) === lvl &&
                        (m.participant1?.id === p.id || m.participant2?.id === p.id)
                    );
                    return inLevel;
                  })
                : participants;
              const entries = computeStandings(matches, lvlParticipants, tournament.format, lvl);
              return (
                <StandingsView
                  key={String(lvl)}
                  entries={entries}
                  tournament={tournament}
                  levelName={isMultiLevel ? lvlName : null}
                />
              );
            })}
          </div>
        );
      })()}

      {activeTab === "gestion" && isOrganizer && (
        <GestionTab
          tournament={tournament}
          matches={matches}
          onMatchesChange={loadData}
        />
      )}

      {activeTab === "setup" && isOrganizer && (
        <TournamentSetup
          tournament={tournament}
          onSaved={loadData}
          onReset={loadData}
        />
      )}

      {/* Bracket Launch Modal — assign diana + first call for not-yet-launched matches */}
      {launchMatch && (() => {
        // Read group-diana assignments from localStorage (written by RRView)
        // Key includes bracketLevel so different levels don't share assignments
        let groupDianas: number[] | undefined;
        if (launchMatch.rrGroup) {
          try {
            const lvl = launchMatch.bracketLevel ?? "default";
            const raw = typeof window !== "undefined"
              ? localStorage.getItem(`rrGroupDianas:${id}:${lvl}`)
              : null;
            const map = raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
            groupDianas = map[launchMatch.rrGroup] ?? [];
          } catch { /* noop */ }
        }
        return (
          <BracketLaunchModal
            match={launchMatch}
            tournamentId={id}
            groupDianas={groupDianas}
            onClose={() => setLaunchMatch(null)}
            onSuccess={async () => {
              try {
                const mRes = await api.get(`/tournaments/${id}/matches`);
                setMatches(mRes.data.data);
              } catch { /* silent */ }
            }}
          />
        );
      })()}

      {/* Edit Participant Metric Modal */}
      {editingParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={() => !editSaving && setEditingParticipant(null)}
        >
          <div
            className="bg-ink-950 border border-ink-800 rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-4 border-b border-ink-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Editar media</h3>
              <button onClick={() => setEditingParticipant(null)} disabled={editSaving}
                className="text-ink-600 hover:text-ink-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-gradient text-white flex items-center justify-center font-black text-sm shrink-0">
                  {(editingParticipant.user?.name ?? editingParticipant.team?.name ?? "?")[0].toUpperCase()}
                </div>
                <p className="text-white font-semibold text-sm">
                  {editingParticipant.user?.name ?? editingParticipant.team?.name ?? "Participante"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-400 mb-1.5">
                  {tournament?.metric === "mpr" ? "MPR" : tournament?.metric === "combined" ? "Combinada" : "PPD"}{" "}
                  <span className="font-normal text-ink-500">(deja vacío para sin media)</span>
                </label>
                <input
                  type="number"
                  step="0.01" min="0"
                  value={editMetricValue}
                  onChange={e => setEditMetricValue(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white
                             placeholder-ink-500 focus:outline-none focus:border-red-500/60
                             focus:ring-1 focus:ring-red-500/20 transition-all text-sm"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setEditingParticipant(null)} disabled={editSaving}
                className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-400
                           hover:text-ink-200 hover:border-ink-500 text-sm font-semibold transition-all">
                Cancelar
              </button>
              <button onClick={handleSaveMetric} disabled={editSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-red-600 hover:bg-red-500 text-white text-sm font-semibold
                           transition-all disabled:opacity-50">
                {editSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                  : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Result Modal */}
      {reportMatch && (
        <ReportResultModal
          match={reportMatch}
          tournament={tournament}
          onClose={() => setReportMatch(null)}
          onSuccess={async (updated) => {
            // Optimistically update the reported match (modal calls onClose itself)
            setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
            // Reload all matches to reflect advancement into next-round slots
            try {
              const mRes = await api.get(`/tournaments/${id}/matches`);
              setMatches(mRes.data.data);
            } catch { /* silent */ }
            // For RR matches, also trigger a full data refresh so the standings
            // recompute (covers score-swap edits where completedCount is unchanged)
            if (updated.rrGroup) {
              loadData();
            }
          }}
        />
      )}

      {/* ── Approve inscription modal ──────────────────────────────────────── */}
      {approvingInsc && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
              <h3 className="text-white font-bold text-sm">Aprobar inscripción</h3>
              <button onClick={() => setApprovingInsc(null)}
                className="p-1 text-ink-500 hover:text-white transition-colors rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Player info */}
              <div className="flex items-center gap-3 p-3 bg-ink-800 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-ink-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {approvingInsc.user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{approvingInsc.user?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {approvingInsc.user?.phone && (
                      <a href={`tel:${approvingInsc.user.phone}`}
                        className="text-green-400 text-xs font-semibold hover:text-green-300 transition-colors">
                        📞 {approvingInsc.user.phone}
                      </a>
                    )}
                    {approvingInsc.user?.province && (
                      <span className="text-ink-500 text-xs">{approvingInsc.user.province}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metric input — layout depends on tournament metric type */}
              {tournament?.metric === "combined" ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wider">
                    Media del jugador
                    {approvingInsc.historicMetric?.value != null && (
                      <span className="ml-2 text-amber-400 normal-case font-normal">
                        {approvingInsc.historicMetric.season ?? "Historial"}: COMB {approvingInsc.historicMetric.value.toFixed(2)}
                        {approvingInsc.historicMetric.level ? ` · ${approvingInsc.historicMetric.level}` : ""}
                      </span>
                    )}
                  </label>
                  {/* PPD + MPR side by side */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-ink-500 mb-1 uppercase tracking-wide font-semibold">PPD</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={approvePpd}
                        onChange={e => setApprovePpd(e.target.value)}
                        className="w-full px-3 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-500 mb-1 uppercase tracking-wide font-semibold">MPR</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={approveMpr}
                        onChange={e => setApproveMpr(e.target.value)}
                        className="w-full px-3 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {/* Auto-computed combined */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl">
                    <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Combinada</span>
                    <span className={approveComputed != null ? "text-amber-400 font-bold text-sm tabular-nums" : "text-ink-600 text-xs italic"}>
                      {approveComputed != null ? approveComputed.toFixed(2) : "—"}
                    </span>
                  </div>
                  {approveComputed == null && (
                    <p className="text-ink-600 text-xs">Rellena PPD y/o MPR para calcular la combinada</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                    Media del jugador
                    {approvingInsc.historicMetric?.value != null && (
                      <span className="ml-2 text-amber-400 normal-case font-normal">
                        {approvingInsc.historicMetric.season ?? "Historial"}: {approvingInsc.historicMetric.metricKey?.toUpperCase()} {approvingInsc.historicMetric.value.toFixed(2)}
                        {approvingInsc.historicMetric.level ? ` · ${approvingInsc.historicMetric.level}` : ""}
                      </span>
                    )}
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    value={approveMetric}
                    onChange={e => setApproveMetric(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm"
                    placeholder="Ej: 25.40 (opcional)"
                  />
                  {!approveMetric && (
                    <p className="text-ink-600 text-xs mt-1">Déjalo vacío si no tiene media asignada</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setApprovingInsc(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
                  Cancelar
                </button>
                <button onClick={handleConfirmApprove} disabled={approving}
                  className="flex-1 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : "✓ Confirmar aprobación"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
