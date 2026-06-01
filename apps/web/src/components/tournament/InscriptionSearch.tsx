"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Search, UserPlus, CheckCircle, Loader2, X, TrendingUp,
  Banknote, CreditCard, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeasonStat {
  season:      string;
  gameType:    string | null;
  ppd:         number | null;
  mpr:         number | null;
  combined:    number | null;
  gamesPlayed: number | null;
  level:       string | null;
}

interface HistoricoPlayer {
  name:        string;
  dni:         string | null;
  cardNumber:  string | null;
  teamName:    string | null;
  provincia:   string | null;
  seasons:     SeasonStat[];
  avgPpd:      number | null;
  avgMpr:      number | null;
  avgCombined: number | null;
}

type PaymentStatus = "pending" | "paid";
type PaymentMethod = "cash" | "card";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tournamentId:      string;
  participantType:   string;
  maxParticipants:   number;
  currentCount:      number;
  registeredUserIds: Set<string>;
  onInscribed:       (userId: string) => void;
  gameType?:         string;
  metric?:           string;
  maxMetric?:        number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function autoEmail(name: string, dni?: string | null): string {
  if (dni) {
    const clean = dni.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${clean}@torneo.local`;
  }
  const slug = name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(".");
  return `${slug}@torneo.local`;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function primaryValue(player: HistoricoPlayer, metric?: string): number | null {
  if (metric === "mpr")      return player.avgMpr;
  if (metric === "combined") return player.avgCombined;
  return player.avgPpd;
}

function primaryLabel(metric?: string): string {
  if (metric === "mpr")      return "MPR";
  if (metric === "combined") return "COMB";
  return "PPD";
}

function seasonValue(s: SeasonStat, metric?: string): number | null {
  if (metric === "mpr")      return s.mpr;
  if (metric === "combined") return s.combined;
  return s.ppd;
}

// ─── Season chip ─────────────────────────────────────────────────────────────

function SeasonChip({
  stat, metric, selected, onClick,
}: {
  stat: SeasonStat; metric?: string; selected: boolean; onClick: () => void;
}) {
  const val = seasonValue(stat, metric);
  const lbl = primaryLabel(metric);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all shrink-0",
        selected
          ? "bg-indigo-600/20 border-indigo-500/60 text-indigo-200"
          : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
      )}
    >
      <span className="text-ink-500 font-normal">{stat.season}</span>
      {val != null && (
        <>
          <span className="text-white font-bold">{fmt(val)}</span>
          <span className={clsx("font-semibold", selected ? "text-indigo-300" : "text-ink-500")}>{lbl}</span>
        </>
      )}
      {stat.gamesPlayed != null && <span className="text-ink-600">{stat.gamesPlayed}p</span>}
      {stat.level && (
        <span className={clsx(
          "px-1.5 py-0.5 rounded text-[10px] font-bold",
          selected ? "bg-indigo-500/20 text-indigo-300" : "bg-amber-900/30 text-amber-400"
        )}>
          {stat.level}
        </span>
      )}
    </button>
  );
}

// ─── Player result card ───────────────────────────────────────────────────────

function PlayerCard({
  player, metric, alreadyInscribed, loading, onInscribe,
}: {
  player:           HistoricoPlayer;
  metric?:          string;
  alreadyInscribed: boolean;
  loading:          boolean;
  onInscribe:       (player: HistoricoPlayer, selectedStat: SeasonStat | null) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null); // null = histórica

  const lbl         = primaryLabel(metric);
  const histVal     = primaryValue(player, metric);
  const isHistorica = selectedIdx === null;
  const selectedStat  = selectedIdx != null ? player.seasons[selectedIdx] : null;
  const selectedValue = selectedStat ? seasonValue(selectedStat, metric) : histVal;

  return (
    <div className={clsx(
      "px-4 py-3.5 transition-colors",
      alreadyInscribed ? "opacity-60" : "hover:bg-ink-900/50"
    )}>
      {/* Top row: name + inscribir */}
      <div className="flex items-start gap-3">
        <div className={clsx(
          "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black shrink-0 mt-0.5",
          alreadyInscribed ? "bg-ink-800 text-ink-500" : "bg-red-gradient text-white shadow-red-sm"
        )}>
          {player.name[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">{player.name}</p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            {player.dni && <span>DNI: {player.dni}</span>}
            {player.dni && player.cardNumber && <span className="mx-1.5 text-ink-700">•</span>}
            {player.cardNumber && <span>{player.cardNumber}</span>}
            {!player.dni && !player.cardNumber && player.teamName && <span>{player.teamName}</span>}
          </p>
        </div>

        <div className="shrink-0">
          {alreadyInscribed ? (
            <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
              <CheckCircle className="w-4 h-4" /> Inscrito
            </span>
          ) : (
            <button
              onClick={() => onInscribe(player, selectedStat)}
              disabled={loading}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                "bg-red-600 hover:bg-red-500 text-white shadow-red-sm",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <UserPlus className="w-3.5 h-3.5" />
              }
              {loading ? "Inscribiendo…" : "Inscribir"}
            </button>
          )}
        </div>
      </div>

      {/* Season chips */}
      <div className="mt-2.5 flex flex-wrap gap-1.5 ml-12">
        {histVal != null && (
          <button
            type="button"
            onClick={() => setSelectedIdx(null)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all shrink-0",
              isHistorica
                ? "bg-red-600/20 border-red-500/60 text-red-200"
                : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
            )}
          >
            <TrendingUp className="w-3 h-3 shrink-0" />
            <span className={clsx("font-normal", isHistorica ? "text-red-300" : "text-ink-500")}>Histórica</span>
            <span className="text-white font-bold">{fmt(histVal)}</span>
            <span className={clsx("font-semibold", isHistorica ? "text-red-300" : "text-ink-500")}>{lbl}</span>
          </button>
        )}
        {player.seasons.map((s, i) => (
          <SeasonChip
            key={`${s.season}-${i}`}
            stat={s}
            metric={metric}
            selected={selectedIdx === i}
            onClick={() => setSelectedIdx(prev => prev === i ? null : i)}
          />
        ))}
      </div>

      {!isHistorica && selectedValue != null && (
        <p className="ml-12 mt-1.5 text-[11px] text-indigo-400">
          Usando valor de <strong>{selectedStat?.season}</strong>: {fmt(selectedValue)} {lbl}
        </p>
      )}
    </div>
  );
}

// ─── Confirmation modal ───────────────────────────────────────────────────────

function ConfirmInscriptionModal({
  player,
  selectedStat,
  metric,
  paymentStatus,
  paymentMethod,
  onChangePaymentStatus,
  onChangePaymentMethod,
  onConfirm,
  onCancel,
  loading,
}: {
  player:                HistoricoPlayer;
  selectedStat:          SeasonStat | null;
  metric?:               string;
  paymentStatus:         PaymentStatus;
  paymentMethod:         PaymentMethod | null;
  onChangePaymentStatus: (v: PaymentStatus) => void;
  onChangePaymentMethod: (v: PaymentMethod) => void;
  onConfirm:             () => void;
  onCancel:              () => void;
  loading:               boolean;
}) {
  const lbl       = primaryLabel(metric);
  const histVal   = primaryValue(player, metric);
  const dispVal   = selectedStat ? seasonValue(selectedStat, metric) : histVal;
  const dispLabel = selectedStat ? selectedStat.season : "Histórica";
  const dispLevel = selectedStat?.level ?? player.seasons.find(s => s.level)?.level;

  const canConfirm = paymentStatus === "pending" || (paymentStatus === "paid" && paymentMethod != null);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onCancel}
    >
      <div
        className="bg-ink-950 border border-ink-800 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-ink-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-base">Confirmar inscripción</h3>
          <button onClick={onCancel} className="text-ink-600 hover:text-ink-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Player info */}
        <div className="px-5 py-4 border-b border-ink-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-gradient text-white flex items-center justify-center font-black text-base shadow-red-sm shrink-0">
              {player.name[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold truncate">{player.name}</p>
              <p className="text-ink-500 text-xs mt-0.5">
                {player.dni && `DNI: ${player.dni}`}
                {player.cardNumber && ` · ${player.cardNumber}`}
              </p>
            </div>
          </div>

          {/* Stat summary */}
          <div className="mt-3 flex flex-wrap gap-2">
            {dispVal != null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/15 border border-red-500/40 rounded-lg text-sm">
                <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                <span className="text-white font-bold">{fmt(dispVal)}</span>
                <span className="text-red-300 font-semibold">{lbl}</span>
                <span className="text-ink-500 text-xs">· {dispLabel}</span>
                {/* Games played */}
                {(() => {
                  const gp = selectedStat?.gamesPlayed
                    ?? player.seasons.reduce((s, r) => s + (r.gamesPlayed ?? 0), 0);
                  return gp > 0
                    ? <span className="text-ink-500 text-xs">· {gp}p</span>
                    : null;
                })()}
              </span>
            )}
            {dispLevel && (
              <span className="inline-flex items-center px-3 py-1.5 bg-amber-900/25 border border-amber-700/40 rounded-lg text-xs font-bold text-amber-400">
                {dispLevel}
              </span>
            )}
          </div>
        </div>

        {/* Payment section */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider">Pago de inscripción</p>

          {/* Pending / Paid choice */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onChangePaymentStatus("pending")}
              className={clsx(
                "flex flex-col items-center gap-1.5 py-3.5 rounded-xl border text-sm font-semibold transition-all",
                paymentStatus === "pending"
                  ? "bg-amber-600/20 border-amber-500/60 text-amber-300"
                  : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
              )}
            >
              <Clock className="w-5 h-5" />
              Pendiente
            </button>
            <button
              type="button"
              onClick={() => onChangePaymentStatus("paid")}
              className={clsx(
                "flex flex-col items-center gap-1.5 py-3.5 rounded-xl border text-sm font-semibold transition-all",
                paymentStatus === "paid"
                  ? "bg-green-600/20 border-green-500/60 text-green-300"
                  : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
              )}
            >
              <CheckCircle className="w-5 h-5" />
              Pagado
            </button>
          </div>

          {/* Cash / Card choice — only when "paid" */}
          {paymentStatus === "paid" && (
            <div className="space-y-2">
              <p className="text-xs text-ink-500">Método de pago</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangePaymentMethod("cash")}
                  className={clsx(
                    "flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all",
                    paymentMethod === "cash"
                      ? "bg-green-600/20 border-green-500/60 text-green-300"
                      : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
                  )}
                >
                  <Banknote className="w-4.5 h-4.5" />
                  Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => onChangePaymentMethod("card")}
                  className={clsx(
                    "flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all",
                    paymentMethod === "card"
                      ? "bg-green-600/20 border-green-500/60 text-green-300"
                      : "bg-ink-900 border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200"
                  )}
                >
                  <CreditCard className="w-4.5 h-4.5" />
                  Tarjeta
                </button>
              </div>
              {!paymentMethod && (
                <p className="text-[11px] text-amber-500 text-center">Selecciona el método de pago</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-500 text-sm font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
              "bg-red-600 hover:bg-red-500 text-white shadow-red-sm",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Inscribiendo…</>
              : <><UserPlus className="w-4 h-4" /> Inscribir</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InscriptionSearch ────────────────────────────────────────────────────────

export function InscriptionSearch({
  tournamentId,
  participantType,
  maxParticipants,
  currentCount,
  registeredUserIds,
  onInscribed,
  gameType,
  metric,
  maxMetric,
}: Props) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<HistoricoPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading]     = useState<string | null>(null);
  const [inscribed, setInscribed] = useState<Set<string>>(new Set());
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // Confirmation modal state
  const [pendingConfirm, setPendingConfirm] = useState<{
    player:       HistoricoPlayer;
    selectedStat: SeasonStat | null;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  const isFull = maxParticipants > 0 && currentCount >= maxParticipants;

  // ── Debounced search ────────────────────────────────────────────────────────
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/player-records/search-for-inscription", {
          params: { q, ...(gameType ? { gameType } : {}) },
        });
        setResults(data.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [gameType]);

  useEffect(() => { search(query); }, [query, search]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Open confirm modal ──────────────────────────────────────────────────────
  const openConfirm = (player: HistoricoPlayer, selectedStat: SeasonStat | null) => {
    setPendingConfirm({ player, selectedStat });
    setPaymentStatus("pending");
    setPaymentMethod(null);
  };

  // ── Do the actual inscription ───────────────────────────────────────────────
  const doInscribe = async () => {
    if (!pendingConfirm) return;
    const { player, selectedStat } = pendingConfirm;
    const key = player.dni ?? player.name;
    setLoading(key);
    try {
      const email       = autoEmail(player.name, player.dni);
      const level       = selectedStat?.level ?? player.seasons.find(s => s.level)?.level ?? undefined;
      const metricValue = selectedStat
        ? (seasonValue(selectedStat, metric) ?? undefined)
        : (primaryValue(player, metric) ?? undefined);

      // Games played: specific season's value, or sum of all seasons for "Histórica"
      const gamesPlayed = selectedStat?.gamesPlayed
        ?? (player.seasons.reduce((sum, s) => sum + (s.gamesPlayed ?? 0), 0) || undefined);

      const res = await api.post("/users/batch-create", {
        players: [{
          name:          player.name,
          email,
          level,
          metricValue:   typeof metricValue === "number" && isFinite(metricValue) ? metricValue : undefined,
          gamesPlayed:   typeof gamesPlayed === "number" && isFinite(gamesPlayed) ? gamesPlayed : undefined,
          dni:           player.dni      ?? undefined,
          teamName:      player.teamName ?? undefined,
          provincia:     player.provincia ?? undefined,
          paymentStatus,
          paymentMethod: paymentStatus === "paid" ? paymentMethod ?? undefined : undefined,
        }],
        tournamentId,
      });

      const result = res?.data?.data?.[0];

      if (!result) {
        // Should never happen — server always returns one result per player
        throw new Error("Respuesta inesperada del servidor");
      }

      if (result.status === "error") {
        toast.error(result.error || "Error del servidor al inscribir");
      } else {
        toast.success(
          <span>
            <strong>{player.name}</strong>{" "}
            {result.status === "created" ? "creado e " : ""}inscrito
          </span>
        );
        setInscribed(prev => new Set(prev).add(key));
        if (result.userId) onInscribed(result.userId);
      }
    } catch (err: any) {
      // Show the actual server message when available; fall back to the JS error
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Error al inscribir al jugador";
      console.error("[doInscribe] error:", err);
      toast.error(msg);
    } finally {
      setLoading(null);
      setPendingConfirm(null);
    }
  };

  // Only render for individual-type tournaments
  if (participantType !== "individual" && participantType !== "parejas_ciegas" && participantType !== "user") return null;

  return (
    <>
      <div className="space-y-4">
        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar jugador por nombre…"
            className="w-full pl-10 pr-10 py-3 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500
                       focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm"
            disabled={isFull}
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-600 hover:text-ink-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {searching && (
            <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 animate-spin" />
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-ink-950 border border-ink-800 rounded-xl overflow-hidden divide-y divide-ink-800/60">
            {results.map((player) => {
              const key             = player.dni ?? player.name;
              const alreadyInscribed = inscribed.has(key);
              const isLoading       = loading === key;
              return (
                <PlayerCard
                  key={key}
                  player={player}
                  metric={metric}
                  alreadyInscribed={alreadyInscribed}
                  loading={isLoading}
                  onInscribe={(p, stat) => openConfirm(p, stat)}
                />
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div className="text-center py-8 text-ink-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No se encontró ningún jugador con ese nombre en el histórico</p>
            <p className="text-xs mt-1 text-ink-600">Prueba con el tab Manual para añadirlo directamente</p>
          </div>
        )}

        {!query && (
          <p className="text-center text-xs text-ink-600 py-4">
            Busca por nombre — se consultan los registros del histórico de jugadores
          </p>
        )}

        {query.trim().length === 1 && (
          <p className="text-center text-xs text-ink-600 py-4">
            Escribe al menos 2 letras para buscar
          </p>
        )}
      </div>

      {/* Confirmation modal */}
      {pendingConfirm && (
        <ConfirmInscriptionModal
          player={pendingConfirm.player}
          selectedStat={pendingConfirm.selectedStat}
          metric={metric}
          paymentStatus={paymentStatus}
          paymentMethod={paymentMethod}
          onChangePaymentStatus={v => {
            setPaymentStatus(v);
            if (v === "pending") setPaymentMethod(null);
          }}
          onChangePaymentMethod={setPaymentMethod}
          onConfirm={doInscribe}
          onCancel={() => setPendingConfirm(null)}
          loading={loading != null}
        />
      )}
    </>
  );
}
