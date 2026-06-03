"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Search, UserPlus, Loader2, Banknote, CreditCard, Clock, CheckCircle, X, Shuffle, AlertTriangle, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { InscriptionSearch } from "./InscriptionSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "search" | "manual" | "group";

interface BatchResult {
  name:      string;
  email:     string;
  status:    "created" | "existing" | "error";
  userId?:   string;
  password?: string;
  error?:    string;
}

interface SeasonStat {
  season:      string;
  gameType:    string | null;
  ppd:         number | null;
  mpr:         number | null;
  combined:    number | null;
  gamesPlayed: number | null;
  level:       string | null;
}

interface PlayerOption {
  id:              string;
  name:            string;
  elo:             number;
  metricValue?:    number | null;  // effective metric (from selected season or historical avg)
  gamesPlayed?:    number | null;
  teamName?:       string | null;
  manual?:         boolean;        // true = manually entered, no DB history
  seasons?:        SeasonStat[];   // historical seasons from playerRecord
  avgMetric?:      number | null;  // historical average for the tournament metric
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LevelInfo {
  name:     string;
  minValue: number;
  maxValue?: number | null;
}

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
  preferredSeason?:  string | null;
  teamSize?:         number | null;
  teamSizeMin?:      number | null;
  metricPlayers?:    number | null;
  levels?:           LevelInfo[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoEmail(name: string, dni?: string): string {
  const base = dni
    ? dni.toLowerCase().replace(/[^a-z0-9]/g, "")
    : name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  return `${base || "jugador"}@torneo.local`;
}

const isIndividualType = (t: string) => t === "individual" || t === "parejas_ciegas";
const isGroupType      = (t: string) => t === "parejas" || t === "trios" || t === "equipos";

function groupSize(participantType: string, teamSize?: number | null) {
  if (participantType === "parejas") return 2;
  if (participantType === "trios")   return 3;
  if (participantType === "equipos") return teamSize ?? 4;
  return 1;
}

function groupLabel(participantType: string) {
  if (participantType === "parejas") return "pareja";
  if (participantType === "trios")   return "trío";
  return "equipo";
}

/** Finds the level a combined metric value belongs to (highest-order level first). */
function findLevel(value: number, levels: LevelInfo[]): LevelInfo | null {
  const sorted = [...levels].sort((a, b) => (b.minValue ?? 0) - (a.minValue ?? 0));
  return sorted.find(l =>
    value >= l.minValue && (l.maxValue == null || value <= l.maxValue)
  ) ?? null;
}

function metricLabel(metric?: string) {
  if (metric === "mpr")      return "MPR";
  if (metric === "combined") return "COMB";
  return "PPD";
}

function seasonValue(s: SeasonStat, metric?: string): number | null {
  if (metric === "mpr")      return s.mpr;
  if (metric === "combined") return s.combined;
  return s.ppd;
}

function avgFromHistorico(
  player: { avgPpd: number | null; avgMpr: number | null; avgCombined: number | null },
  metric?: string,
): number | null {
  if (metric === "mpr")      return player.avgMpr;
  if (metric === "combined") return player.avgCombined;
  return player.avgPpd;
}

// ─── Manual tab (for individual / parejas_ciegas) ─────────────────────────────

function ManualTab({ tournamentId, isFull, onInscribed, metric, maxMetric }: {
  tournamentId: string;
  isFull:       boolean;
  onInscribed:  (userId: string) => void;
  metric?:      string;
  maxMetric?:   number | null;
}) {
  const [form, setForm] = useState({ name: "", dni: "", ppd: "", mpr: "" });
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const combinada = useMemo(() => {
    const ppd = parseFloat(form.ppd);
    const mpr = parseFloat(form.mpr);
    if (isNaN(ppd) && isNaN(mpr)) return null;
    return ((isNaN(mpr) ? 0 : mpr) * 10) + (isNaN(ppd) ? 0 : ppd);
  }, [form.ppd, form.mpr]);

  const metricValue = useMemo(() => {
    if (metric === "ppd") return form.ppd ? parseFloat(form.ppd) : null;
    if (metric === "mpr") return form.mpr ? parseFloat(form.mpr) : null;
    return combinada;
  }, [metric, form.ppd, form.mpr, combinada]);

  const overLimit = maxMetric != null && metricValue != null && metricValue > maxMetric;

  const isValid =
    form.name.trim().length > 0 &&
    paymentStatus !== null &&
    (paymentStatus === "pending" || paymentMethod !== null) &&
    !overLimit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const email = autoEmail(form.name.trim(), form.dni.trim() || undefined);
      const ppd = form.ppd ? parseFloat(form.ppd) : undefined;
      const mpr = form.mpr ? parseFloat(form.mpr) : undefined;

      const { data } = await api.post("/users/batch-create", {
        players: [{
          name:          form.name.trim(),
          email,
          dni:           form.dni.trim() || undefined,
          ppd,
          mpr,
          metricValue:   metricValue ?? undefined,
          paymentStatus: paymentStatus!,
          paymentMethod: paymentStatus === "paid" ? paymentMethod! : undefined,
        }],
        tournamentId,
      });
      const result: BatchResult = data.data[0];
      if (result.status === "error") {
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success(
          <span><strong>{result.name}</strong>{" "}{result.status === "created" ? "creado e " : ""}inscrito</span>,
          { duration: 5000 }
        );
        if (result.userId) onInscribed(result.userId);
        setForm({ name: "", dni: "", ppd: "", mpr: "" });
        setPaymentStatus(null);
        setPaymentMethod(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear el jugador");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-ink-500">
        Inscribe jugadores que no están en la base de datos. Sus estadísticas quedarán guardadas.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">Nombre completo <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={update("name")} placeholder="Ana García López" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">DNI / Nº licencia</label>
          <input type="text" value={form.dni} onChange={update("dni")} placeholder="12345678A" className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">PPD</label>
          <input type="number" value={form.ppd} onChange={update("ppd")} placeholder="0.00" step="0.01" min={0} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">MPR</label>
          <input type="number" value={form.mpr} onChange={update("mpr")} placeholder="0.00" step="0.01" min={0} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-400 mb-1.5">Combinada</label>
          <div className={clsx(inputCls, "text-right font-mono font-semibold select-none",
            combinada != null ? "text-amber-400" : "text-ink-600 italic text-xs font-normal")}>
            {combinada != null ? combinada.toFixed(2) : "auto"}
          </div>
        </div>
      </div>

      {/* maxMetric warning */}
      {overLimit && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 px-3 py-2 rounded-lg">
          ⚠ La media ({metricValue!.toFixed(2)}) supera el límite del torneo ({maxMetric!.toFixed(2)})
        </p>
      )}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink-400">Estado de pago <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setPaymentStatus("pending"); setPaymentMethod(null); }}
            className={clsx("flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all",
              paymentStatus === "pending" ? "bg-amber-900/30 border-amber-700/60 text-amber-400" : "border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600")}>
            <Clock className="w-4 h-4" /> Pendiente
          </button>
          <button type="button" onClick={() => setPaymentStatus("paid")}
            className={clsx("flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all",
              paymentStatus === "paid" ? "bg-green-900/30 border-green-700/60 text-green-400" : "border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600")}>
            <CheckCircle className="w-4 h-4" /> Pagado
          </button>
        </div>
        {paymentStatus === "paid" && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPaymentMethod("cash")}
              className={clsx("flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm border transition-all",
                paymentMethod === "cash" ? "bg-ink-700 border-ink-500 text-white" : "border-ink-800 text-ink-500 hover:text-ink-300 hover:border-ink-700")}>
              <Banknote className="w-4 h-4" /> Efectivo
            </button>
            <button type="button" onClick={() => setPaymentMethod("card")}
              className={clsx("flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm border transition-all",
                paymentMethod === "card" ? "bg-ink-700 border-ink-500 text-white" : "border-ink-800 text-ink-500 hover:text-ink-300 hover:border-ink-700")}>
              <CreditCard className="w-4 h-4" /> Tarjeta
            </button>
          </div>
        )}
      </div>

      <button type="submit" disabled={!isValid || loading || isFull}
        className={clsx("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all",
          "bg-red-600 hover:bg-red-500 text-white shadow-red-sm",
          "disabled:opacity-40 disabled:cursor-not-allowed")}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</> : <><UserPlus className="w-4 h-4" /> Crear e inscribir jugador</>}
      </button>
      {isFull && <p className="text-center text-xs text-red-400">El torneo ha alcanzado su capacidad máxima</p>}
    </form>
  );
}

// ─── Slot accent colours ─────────────────────────────────────────────────────

const SLOT_ACCENT = [
  { border: "border-blue-500/50",   bg: "bg-blue-950/40",   text: "text-blue-300",   badge: "bg-blue-500/20",   num: "text-blue-400"   },
  { border: "border-amber-500/50",  bg: "bg-amber-950/40",  text: "text-amber-300",  badge: "bg-amber-500/20",  num: "text-amber-400"  },
  { border: "border-green-500/50",  bg: "bg-green-950/40",  text: "text-green-300",  badge: "bg-green-500/20",  num: "text-green-400"  },
  { border: "border-purple-500/50", bg: "bg-purple-950/40", text: "text-purple-300", badge: "bg-purple-500/20", num: "text-purple-400" },
  { border: "border-cyan-500/50",   bg: "bg-cyan-950/40",   text: "text-cyan-300",   badge: "bg-cyan-500/20",   num: "text-cyan-400"   },
  { border: "border-pink-500/50",   bg: "bg-pink-950/40",   text: "text-pink-300",   badge: "bg-pink-500/20",   num: "text-pink-400"   },
  { border: "border-rose-500/50",   bg: "bg-rose-950/40",   text: "text-rose-300",   badge: "bg-rose-500/20",   num: "text-rose-400"   },
];

const CIRCLED = ["①","②","③","④","⑤","⑥","⑦"];

// ─── PlayerSlot ───────────────────────────────────────────────────────────────

// Shape returned by /player-records/search-for-inscription
interface HistoricoResult {
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

function PlayerSlot({
  index, player, otherPlayers, onSelect, onClear, onMetricChange, maxMetric, metric, tournamentId,
}: {
  index:          number;
  player:         PlayerOption | null;
  otherPlayers:   PlayerOption[];
  onSelect:       (p: PlayerOption) => void;
  onClear:        () => void;
  onMetricChange: (value: number | null) => void;
  maxMetric?:     number | null;
  metric?:        string;
  tournamentId:   string;
}) {
  const accent = SLOT_ACCENT[index % SLOT_ACCENT.length];
  const mLbl   = metricLabel(metric);

  const [query,           setQuery]           = useState("");
  const [results,         setResults]         = useState<HistoricoResult[]>([]);
  const [searching,       setSearching]       = useState(false);
  const [resolving,       setResolving]       = useState(false);
  const [showManual,      setShowManual]      = useState(false);
  const [manualName,      setManualName]      = useState("");
  const [manualDni,       setManualDni]       = useState("");
  const [manualMpr,       setManualMpr]       = useState("");
  const [manualPpd,       setManualPpd]       = useState("");
  const [manualProvincia, setManualProvincia] = useState("");
  const [creating,        setCreating]        = useState(false);
  // Which season chip is selected (null = historical avg)
  const [selectedStatIdx, setSelectedStatIdx] = useState<number | null>(null);

  // Reset season selection when player changes
  useEffect(() => {
    setSelectedStatIdx(null);
  }, [player?.id]);

  // ── DNI/NIE validation ───────────────────────────────────────────────────────
  const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
  const dniStatus: "empty" | "valid" | "invalid" = useMemo(() => {
    const val = manualDni.trim().toUpperCase();
    if (!val) return "empty";
    const isDni = /^[0-9]{8}[A-Z]$/.test(val);
    const isNie = /^[XYZ][0-9]{7}[A-Z]$/.test(val);
    if (!isDni && !isNie) return "invalid";
    const numStr = isNie
      ? String("XYZ".indexOf(val[0])) + val.slice(1, -1)
      : val.slice(0, -1);
    return val[val.length - 1] === DNI_LETTERS[parseInt(numStr, 10) % 23] ? "valid" : "invalid";
  }, [manualDni]);

  // ── Effective metric for the slot from manual PPD/MPR ────────────────────────
  const manualMetricValue = useMemo(() => {
    const mpr = parseFloat(manualMpr);
    const ppd = parseFloat(manualPpd);
    if (metric === "mpr")      return isNaN(mpr) ? null : mpr;
    if (metric === "ppd")      return isNaN(ppd) ? null : ppd;
    if (metric === "combined") {
      if (isNaN(mpr) && isNaN(ppd)) return null;
      return (isNaN(mpr) ? 0 : mpr) * 10 + (isNaN(ppd) ? 0 : ppd);
    }
    return null;
  }, [manualMpr, manualPpd, metric]);

  const inputCls =
    "w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm";

  // ── Search (historico, same as individual tab) ──────────────────────────────
  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get("/player-records/search-for-inscription", {
        params: { q, ...(metric ? { gameType: metric } : {}) },
      });
      const takenNames = otherPlayers.map(p => p.name.toLowerCase());
      setResults((data.data as HistoricoResult[]).filter(r => !takenNames.includes(r.name.toLowerCase())));
    } catch { /**/ } finally { setSearching(false); }
  };

  // ── Select a historico result → resolve user ID ─────────────────────────────
  const selectResult = async (r: HistoricoResult) => {
    setResolving(true);
    setQuery(""); setResults([]);
    try {
      const { data } = await api.post("/users/find-or-create", {
        name: r.name,
        dni:  r.dni || undefined,
      });
      const avgM = avgFromHistorico(r, metric);
      const totalGames = r.seasons.reduce((s, x) => s + (x.gamesPlayed ?? 0), 0) || null;
      const newPlayer: PlayerOption = {
        id:          data.data.id,
        name:        r.name,
        elo:         1000,
        metricValue: avgM,       // start with historical avg
        gamesPlayed: totalGames,
        teamName:    r.teamName,
        seasons:     r.seasons,
        avgMetric:   avgM,
      };
      onSelect(newPlayer);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al buscar el jugador");
    } finally {
      setResolving(false);
    }
  };

  // ── Season chip click ────────────────────────────────────────────────────────
  const handleSeasonClick = (idx: number | null) => {
    if (!player) return;
    setSelectedStatIdx(idx);
    let newValue: number | null;
    if (idx === null) {
      newValue = player.avgMetric ?? null;
    } else {
      newValue = player.seasons ? seasonValue(player.seasons[idx], metric) : null;
    }
    onMetricChange(newValue);
  };

  // ── Manual "no listado" ─────────────────────────────────────────────────────
  const confirmManual = async () => {
    if (!manualName.trim()) return;
    setCreating(true);
    try {
      const ppd      = manualPpd  ? parseFloat(manualPpd)  : undefined;
      const mpr      = manualMpr  ? parseFloat(manualMpr)  : undefined;
      const email    = autoEmail(manualName.trim(), manualDni.trim() || undefined);
      const { data } = await api.post("/users/batch-create", {
        players: [{
          name:        manualName.trim(),
          email,
          dni:         manualDni.trim()       || undefined,
          ppd:         ppd  != null && !isNaN(ppd)  ? ppd  : undefined,
          mpr:         mpr  != null && !isNaN(mpr)  ? mpr  : undefined,
          metricValue: manualMetricValue != null ? manualMetricValue : undefined,
          provincia:   manualProvincia.trim() || undefined,
        }],
        // no tournamentId → just creates user + saves PlayerRecord, no inscription
      });
      const result = data.data[0];
      if (result.status === "error") {
        toast.error(result.error || "Error al crear el jugador"); return;
      }
      onSelect({
        id:          result.userId!,
        name:        manualName.trim(),
        elo:         1000,
        metricValue: manualMetricValue,
        manual:      true,
      });
      setManualName(""); setManualDni(""); setManualMpr(""); setManualPpd("");
      setManualProvincia(""); setShowManual(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear el jugador");
    } finally { setCreating(false); }
  };

  // ── Effective metric value for display ──────────────────────────────────────
  const displayMetric = player?.metricValue ?? null;
  const overLimit = displayMetric != null && maxMetric != null && displayMetric > maxMetric;

  return (
    <div className={clsx("rounded-2xl border p-3 space-y-2.5 transition-all", accent.border, accent.bg)}>
      {/* Slot header */}
      <div className="flex items-center gap-2">
        <span className={clsx("text-base font-bold", accent.num)}>{CIRCLED[index]}</span>
        <span className={clsx("text-[10px] font-black tracking-widest uppercase", accent.text)}>
          Jugador {index + 1}
        </span>
      </div>

      {player ? (
        /* ── Selected player card ── */
        <div className="relative bg-ink-950/60 rounded-xl px-3 py-2.5 space-y-2">
          <button type="button" onClick={onClear}
            className="absolute top-2 right-2 text-ink-600 hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Name + team */}
          <div className="pr-5">
            <p className={clsx("font-bold text-sm leading-tight", accent.text)}>{player.name}</p>
            {player.teamName && (
              <p className="text-[10px] text-ink-500 mt-0.5 truncate uppercase tracking-wide">{player.teamName}</p>
            )}
          </div>

          {/* Metric display — read-only from DB, or editable for manual players */}
          {player.manual ? (
            /* Manual player: keep an editable input */
            <div className="flex items-center gap-2">
              <input
                type="number"
                defaultValue={player.metricValue ?? ""}
                onChange={e => {
                  const v = e.target.value === "" ? null : parseFloat(e.target.value);
                  onMetricChange(v != null && !isNaN(v) ? v : null);
                }}
                placeholder={`${mLbl}…`}
                step="0.01" min="0"
                className={clsx(
                  "flex-1 px-3 py-1.5 bg-ink-900 border rounded-lg text-sm font-bold tabular-nums",
                  "placeholder-ink-600 focus:outline-none focus:ring-1 transition-all",
                  overLimit
                    ? "border-red-500/60 text-red-400 focus:ring-red-500/20"
                    : `${accent.border} text-white focus:ring-red-500/20`
                )}
              />
              <span className={clsx("text-xs font-black shrink-0", accent.text)}>{mLbl}</span>
            </div>
          ) : displayMetric != null ? (
            /* DB player: large read-only badge */
            <div className={clsx(
              "flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg",
              accent.badge,
              overLimit ? "bg-red-900/30" : ""
            )}>
              <span className={clsx("text-2xl font-black tabular-nums leading-none",
                overLimit ? "text-red-400" : accent.text)}>
                {displayMetric.toFixed(2)}
              </span>
              <span className={clsx("text-xs font-black", overLimit ? "text-red-400" : accent.text)}>
                {mLbl}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-ink-600 italic">Sin media registrada</p>
          )}

          {/* Season chips — only for DB players with multiple seasons */}
          {!player.manual && player.seasons && player.seasons.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {/* Historical avg chip */}
              <button type="button" onClick={() => handleSeasonClick(null)}
                className={clsx(
                  "px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all",
                  selectedStatIdx === null
                    ? `${accent.badge} ${accent.border} ${accent.text}`
                    : "bg-ink-900 border-ink-700 text-ink-500 hover:border-ink-500"
                )}>
                Hist.{player.avgMetric != null ? ` ${player.avgMetric.toFixed(2)}` : ""}
              </button>
              {player.seasons.map((s, i) => {
                const val = seasonValue(s, metric);
                return (
                  <button key={i} type="button" onClick={() => handleSeasonClick(i)}
                    className={clsx(
                      "px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all",
                      selectedStatIdx === i
                        ? `${accent.badge} ${accent.border} ${accent.text}`
                        : "bg-ink-900 border-ink-700 text-ink-500 hover:border-ink-500"
                    )}>
                    {s.season}{val != null ? ` ${val.toFixed(2)}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : showManual ? (
        /* ── Manual "no listado" form ── */
        <div className="space-y-2">
          {/* Nombre */}
          <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
            placeholder="Nombre completo *" className={inputCls} autoFocus />

          {/* DNI/NIE con validador */}
          <div className="relative">
            <input
              type="text"
              value={manualDni}
              onChange={e => setManualDni(e.target.value)}
              placeholder="DNI / NIE (opcional)"
              maxLength={9}
              className={clsx(inputCls, "pr-8",
                dniStatus === "valid"   && "border-green-500/60 focus:border-green-500/60",
                dniStatus === "invalid" && manualDni.length >= 8 && "border-red-500/60 focus:border-red-500/60"
              )}
            />
            {dniStatus === "valid" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-xs font-bold">✓</span>
            )}
            {dniStatus === "invalid" && manualDni.length >= 8 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-xs font-bold">✗</span>
            )}
          </div>

          {/* Provincia */}
          <>
            <input
              type="text"
              list={`prov-list-${index}`}
              value={manualProvincia}
              onChange={e => setManualProvincia(e.target.value)}
              placeholder="Provincia *"
              className={inputCls}
            />
            <datalist id={`prov-list-${index}`}>
              {["Álava","Albacete","Alicante","Almería","Asturias","Ávila","Badajoz","Barcelona",
                "Burgos","Cáceres","Cádiz","Cantabria","Castellón","Ciudad Real","Córdoba","Cuenca",
                "Girona","Granada","Guadalajara","Guipúzcoa","Huelva","Huesca","Islas Baleares",
                "Jaén","La Coruña","La Rioja","Las Palmas","León","Lleida","Lugo","Madrid","Málaga",
                "Murcia","Navarra","Ourense","Palencia","Pontevedra","Salamanca",
                "Santa Cruz de Tenerife","Segovia","Sevilla","Soria","Tarragona","Teruel","Toledo",
                "Valencia","Valladolid","Vizcaya","Zamora","Zaragoza","Ceuta","Melilla",
              ].map(p => <option key={p} value={p} />)}
            </datalist>
          </>

          {/* MPR + PPD en dos columnas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-ink-500 mb-1 uppercase tracking-wide font-semibold">
                MPR <span className="text-red-400">*</span>
              </label>
              <input type="number" value={manualMpr} onChange={e => setManualMpr(e.target.value)}
                placeholder="0.00" step="0.01" min="0" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-ink-500 mb-1 uppercase tracking-wide font-semibold">
                PPD <span className="text-red-400">*</span>
              </label>
              <input type="number" value={manualPpd} onChange={e => setManualPpd(e.target.value)}
                placeholder="0.00" step="0.01" min="0" className={inputCls} />
            </div>
          </div>

          {/* Metric required warning */}
          {manualMpr.trim() === "" && manualPpd.trim() === "" && (
            <p className="text-[11px] text-amber-400 bg-amber-900/10 border border-amber-800/30 px-3 py-2 rounded-lg flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Rellena MPR y/o PPD para guardar las estadísticas del jugador
            </p>
          )}

          {/* Computed metric preview */}
          {manualMetricValue != null && (
            <p className={clsx("text-xs px-2 py-1 rounded-lg text-center font-semibold",
              accent.badge, accent.text)}>
              {mLbl} efectivo: {manualMetricValue.toFixed(2)}
            </p>
          )}

          <div className="flex gap-2 pt-0.5">
            <button type="button" onClick={confirmManual}
              disabled={!manualName.trim() || !manualProvincia.trim() || (manualMpr.trim() === "" && manualPpd.trim() === "") || creating || dniStatus === "invalid"}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-500
                         text-white text-xs font-bold disabled:opacity-40 transition-all">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {creating ? "Creando…" : "Añadir"}
            </button>
            <button type="button" onClick={() => setShowManual(false)}
              className="flex-1 py-2 rounded-xl border border-ink-700 text-ink-400 hover:text-ink-200 text-xs font-semibold transition-all">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        /* ── Search input ── */
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500" />
            {(searching || resolving) && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-500 animate-spin" />
            )}
            <input type="text" value={query} onChange={e => search(e.target.value)}
              placeholder={`Buscar jugador ${index + 1}…`}
              className={inputCls + " pl-9"} />
            {results.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-ink-900 border border-ink-700 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                {results.map((r, ri) => {
                  const avgM = avgFromHistorico(r, metric);
                  return (
                    <button key={ri} type="button" onClick={() => selectResult(r)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-ink-800 transition-colors text-left">
                      <div className="min-w-0">
                        <p className="text-sm text-white font-semibold truncate">{r.name}</p>
                        {r.teamName && <p className="text-[10px] text-ink-500 truncate">{r.teamName}</p>}
                      </div>
                      {avgM != null && (
                        <span className={clsx("text-sm font-bold tabular-nums ml-3 shrink-0",
                          maxMetric != null && avgM > maxMetric ? "text-red-400" : accent.text)}>
                          {avgM.toFixed(2)} {mLbl}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button type="button" onClick={() => { setShowManual(true); setQuery(""); setResults([]); }}
            className={clsx("text-xs font-semibold transition-colors", accent.text, "hover:opacity-80")}>
            + Jugador no listado
          </button>
        </div>
      )}
    </div>
  );
}

// ─── GroupTab (parejas / trios / equipos) ─────────────────────────────────────

function GroupTab({ tournamentId, participantType, isFull, onInscribed, maxMetric, teamSize: tSize, teamSizeMin: tSizeMin, metricPlayers: mPlayers, levels, metric }: {
  tournamentId:    string;
  participantType: string;
  isFull:          boolean;
  onInscribed:     (teamId: string) => void;
  maxMetric?:      number | null;
  teamSize?:       number | null;
  teamSizeMin?:    number | null;
  metricPlayers?:  number | null;
  levels?:         LevelInfo[];
  metric?:         string;
}) {
  // size = max slots to show; minSize = required slots
  const size    = groupSize(participantType, tSize);
  const minSize = (participantType === "equipos" && tSizeMin != null) ? tSizeMin : size;
  const label   = groupLabel(participantType);

  // slots[i] = null means empty, PlayerOption means selected
  const [slots,       setSlots]       = useState<(PlayerOption | null)[]>(() => Array(size).fill(null));
  const [groupName,   setGroupName]   = useState("");
  const [nameEdited,  setNameEdited]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | null>(null);

  const setSlot = (i: number, p: PlayerOption | null) => {
    // Auto-generate name from filled slots (unless user edited it manually)
    setSlots(prev => {
      const next = [...prev]; next[i] = p;
      if (!nameEdited) {
        const filled = next.filter(Boolean) as PlayerOption[];
        if (filled.length >= 2) setGroupName(filled.map(x => x.name.split(" ")[0]).join(" & "));
        else if (filled.length < 2) setGroupName("");
      }
      return next;
    });
  };

  const setSlotMetric = (i: number, v: number | null) => {
    setSlots(prev => {
      const next = [...prev];
      if (next[i]) next[i] = { ...next[i]!, metricValue: v };
      return next;
    });
  };

  const filledPlayers  = slots.filter(Boolean) as PlayerOption[];
  const allFilled      = filledPlayers.length === size;
  const enoughFilled   = filledPlayers.length >= minSize; // at least required slots filled

  // ── Team metric: average of top-N players by metric ──────────────────────
  const metricN = mPlayers ?? filledPlayers.length;  // how many top players count (of those filled)
  const knownMetrics = filledPlayers
    .map(p => p.metricValue ?? null)
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a);          // descending — best first
  const topNMetrics = knownMetrics.slice(0, metricN);
  const allHaveMetric = enoughFilled && knownMetrics.length === filledPlayers.length;
  const combinedMetric: number | null = topNMetrics.length > 0
    ? Math.round((topNMetrics.reduce((a, b) => a + b, 0) / topNMetrics.length) * 100) / 100
    : null;
  // Players that count (sorted desc, top-N) — for highlighting in UI
  const countingThreshold = topNMetrics.length > 0 ? topNMetrics[topNMetrics.length - 1] : null;

  const combinedOverLimit = maxMetric != null && combinedMetric != null && combinedMetric > maxMetric;
  const assignedLevel     = combinedMetric != null && levels && levels.length > 0 && !combinedOverLimit
    ? findLevel(combinedMetric, levels)
    : null;
  const mLbl = metricLabel(metric);

  const isValid =
    groupName.trim().length > 0 &&
    enoughFilled &&
    !combinedOverLimit &&
    paymentStatus !== null &&
    (paymentStatus === "pending" || paymentMethod !== null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const players    = filledPlayers;
      const metricValues: Record<string, number> = {};
      players.forEach(p => { if (p.metricValue != null) metricValues[p.id] = p.metricValue; });

      await api.post(`/tournaments/${tournamentId}/participants/group`, {
        groupName:    groupName.trim(),
        playerIds:    players.map(p => p.id),
        metricValues: Object.keys(metricValues).length > 0 ? metricValues : undefined,
        paymentStatus: paymentStatus!,
        paymentMethod: paymentStatus === "paid" ? paymentMethod : null,
      });
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} "${groupName}" inscrita`);
      onInscribed(players[0].id);
      setSlots(Array(size).fill(null));
      setGroupName(""); setNameEdited(false);
      setPaymentStatus(null); setPaymentMethod(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al inscribir");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Player slots grid */}
      <div className={clsx(
        "grid gap-3",
        size === 2 ? "grid-cols-2" :
        size === 3 ? "grid-cols-3" :
        "grid-cols-2"
      )}>
        {Array.from({ length: size }, (_, i) => {
          const isOptional = i >= minSize;
          return (
            <div key={i} className="relative">
              {isOptional && (
                <span className="absolute -top-1.5 right-2 z-10 text-[9px] font-black uppercase tracking-widest bg-ink-800 border border-ink-600 text-ink-400 px-1.5 py-0.5 rounded-md">
                  Opcional
                </span>
              )}
              <PlayerSlot
                index={i}
                player={slots[i]}
                otherPlayers={(slots.filter(Boolean) as PlayerOption[]).filter((_, j) => j !== i)}
                onSelect={p => setSlot(i, p)}
                onClear={() => setSlot(i, null)}
                onMetricChange={v => setSlotMetric(i, v)}
                maxMetric={maxMetric}
                metric={metric}
                tournamentId={tournamentId}
              />
            </div>
          );
        })}
      </div>

      {/* Combined metric result — shown once required slots are filled */}
      {enoughFilled && (
        <div className={clsx(
          "rounded-2xl border px-5 py-4 text-center space-y-2",
          combinedOverLimit
            ? "bg-red-950/60 border-red-600/60"
            : assignedLevel
              ? "bg-green-950/50 border-green-600/40"
              : "bg-ink-950 border-ink-700"
        )}>
          <p className={clsx(
            "text-[10px] font-black tracking-[0.15em] uppercase",
            combinedOverLimit ? "text-red-500" : assignedLevel ? "text-green-500" : "text-ink-500"
          )}>
            {participantType === "parejas" ? "Pareja" : participantType === "trios" ? "Trío" : "Equipo"}
            {metric ? ` ${metric.toUpperCase() === "MPR" ? "Cricket" : metric === "01" ? "01" : "Combo"}` : ""}
            {" — "}{mLbl} Media
            {metricN < filledPlayers.length && ` (top ${metricN})`}
          </p>

          {combinedMetric != null ? (
            <>
              <p className={clsx(
                "text-5xl font-black tabular-nums leading-none",
                combinedOverLimit ? "text-red-400" : "text-white"
              )}>
                {combinedMetric.toFixed(2)}
              </p>

              {/* Per-player breakdown: counting players highlighted, others dimmed */}
              {metricN < size && filledPlayers.some(p => p.metricValue != null) && (
                <div className="flex flex-wrap justify-center gap-1 text-[10px]">
                  {[...filledPlayers]
                    .sort((a, b) => (b.metricValue ?? -1) - (a.metricValue ?? -1))
                    .map((p, i) => (
                      <span key={`${p.id}-${i}`} className={clsx(
                        "px-2 py-0.5 rounded-md font-semibold",
                        i < metricN
                          ? "bg-green-900/30 text-green-300 border border-green-700/40"
                          : "bg-ink-800 text-ink-600 border border-ink-700 line-through"
                      )}>
                        {p.name.split(" ")[0]} {p.metricValue != null ? `(${p.metricValue.toFixed(2)})` : ""}
                      </span>
                    ))}
                </div>
              )}

              {combinedOverLimit ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-black text-red-400 uppercase tracking-wide flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Media excedida — No se puede inscribir
                  </p>
                  {maxMetric != null && (
                    <p className="text-xs text-ink-500 mt-0.5">
                      Límite máximo: <span className="text-white font-bold">{maxMetric.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              ) : assignedLevel ? (
                <div className="flex flex-col items-center gap-0.5">
                  <p className="text-sm text-green-400 font-semibold flex items-center gap-1.5">
                    <ChevronRight className="w-4 h-4" />
                    Entraría en <span className="font-black">{assignedLevel.name}</span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {mLbl} {assignedLevel.minValue}{assignedLevel.maxValue != null ? `–${assignedLevel.maxValue}` : "+"}
                  </p>
                </div>
              ) : levels && levels.length > 0 ? (
                <p className="text-xs text-amber-400 flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> No encaja en ningún nivel definido
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-ink-500 py-2">
              Sin datos de media para uno o más jugadores — se verificará al inscribir
            </p>
          )}
        </div>
      )}

      {/* Group name */}
      <div>
        <label className="block text-xs font-medium text-ink-400 mb-1.5">
          Nombre del {label} <span className="text-red-500">*</span>
        </label>
        <input type="text" value={groupName}
          onChange={e => { setGroupName(e.target.value); setNameEdited(true); }}
          placeholder={participantType === "parejas" ? "García & Martínez" : participantType === "trios" ? "Trío Las Estrellas" : "Club Dardos Madrid"}
          className={inputCls} />
      </div>

      {/* Payment */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink-400">Estado de pago <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setPaymentStatus("pending"); setPaymentMethod(null); }}
            className={clsx("flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all",
              paymentStatus === "pending" ? "bg-amber-900/30 border-amber-700/60 text-amber-400" : "border-ink-700 text-ink-400 hover:text-ink-200")}>
            <Clock className="w-4 h-4" /> Pendiente
          </button>
          <button type="button" onClick={() => setPaymentStatus("paid")}
            className={clsx("flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border transition-all",
              paymentStatus === "paid" ? "bg-green-900/30 border-green-700/60 text-green-400" : "border-ink-700 text-ink-400 hover:text-ink-200")}>
            <CheckCircle className="w-4 h-4" /> Pagado
          </button>
        </div>
        {paymentStatus === "paid" && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPaymentMethod("cash")}
              className={clsx("flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm border transition-all",
                paymentMethod === "cash" ? "bg-ink-700 border-ink-500 text-white" : "border-ink-800 text-ink-500 hover:text-ink-300")}>
              <Banknote className="w-4 h-4" /> Efectivo
            </button>
            <button type="button" onClick={() => setPaymentMethod("card")}
              className={clsx("flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm border transition-all",
                paymentMethod === "card" ? "bg-ink-700 border-ink-500 text-white" : "border-ink-800 text-ink-500 hover:text-ink-300")}>
              <CreditCard className="w-4 h-4" /> Tarjeta
            </button>
          </div>
        )}
      </div>

      <button type="submit" disabled={!isValid || submitting || isFull}
        className={clsx("w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
          "bg-red-600 hover:bg-red-500 text-white", "disabled:opacity-40 disabled:cursor-not-allowed")}>
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Inscribiendo…</> : <><UserPlus className="w-4 h-4" /> Inscribir {label}</>}
      </button>
      {isFull && <p className="text-center text-xs text-red-400">El torneo ha alcanzado su capacidad máxima</p>}
    </form>
  );
}

// ─── BlindPairButton ──────────────────────────────────────────────────────────

function BlindPairButton({ tournamentId, onDone }: { tournamentId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const handlePair = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/tournaments/${tournamentId}/blind-pair`);
      toast.success(`${data.data.pairs.length} parejas formadas`);
      onDone();
      setConfirm(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al realizar el emparejamiento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-purple-900/10 border border-purple-700/30 rounded-2xl space-y-3">
      <div className="flex items-center gap-2">
        <Shuffle className="w-4 h-4 text-purple-400" />
        <p className="text-sm font-semibold text-purple-300">Realizar sorteo de parejas ciegas</p>
      </div>
      <p className="text-xs text-ink-400">
        Divide los jugadores inscritos en dos grupos por media (altos y bajos) y los empareja al azar.
        Esta acción no se puede deshacer.
      </p>
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)}
          className="w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold transition-colors">
          <Shuffle className="w-4 h-4 inline mr-1.5" /> Sortear parejas
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={handlePair} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Sí, sortear"}
          </button>
          <button type="button" onClick={() => setConfirm(false)}
            className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white transition-colors">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── InscriptionPanel (main export) ──────────────────────────────────────────

export function InscriptionPanel({
  tournamentId, participantType, maxParticipants, currentCount,
  registeredUserIds, onInscribed, gameType, metric, maxMetric, preferredSeason, teamSize, teamSizeMin, metricPlayers, levels,
}: Props) {
  const isFull = maxParticipants > 0 && currentCount >= maxParticipants;

  const showGroup  = isGroupType(participantType);
  const showIndiv  = isIndividualType(participantType);
  const showBlind  = participantType === "parejas_ciegas";

  type Tab = "search" | "manual" | "group";
  const defaultTab: Tab = showGroup ? "group" : "search";
  const [tab, setTab] = useState<Tab>(defaultTab);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(showIndiv ? [
      { id: "search" as Tab, label: "Buscar",  icon: <Search   className="w-3.5 h-3.5" /> },
      { id: "manual" as Tab, label: "Manual",  icon: <UserPlus className="w-3.5 h-3.5" /> },
    ] : []),
    ...(showGroup ? [
      { id: "group"  as Tab, label: participantType === "parejas" ? "Pareja" : participantType === "trios" ? "Trío" : "Equipo",
        icon: <UserPlus className="w-3.5 h-3.5" /> },
    ] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Capacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-400">
            <span className="text-white font-semibold">{currentCount}</span>
            <span className="text-ink-600 mx-1">/</span>
            <span>{maxParticipants === 0 ? "∞" : maxParticipants}</span>
            <span className="ml-1 text-ink-500">plazas</span>
          </span>
          {isFull && (
            <span className="text-xs font-semibold text-red-400 bg-red-900/20 border border-red-800/40 px-2.5 py-1 rounded-full">Completo</span>
          )}
        </div>
        {maxParticipants > 0 && (
          <div className="w-full h-1.5 bg-ink-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (currentCount / maxParticipants) * 100)}%` }} />
          </div>
        )}
        {maxMetric != null && (
          <p className="text-xs text-amber-400/80">Límite de media: {maxMetric.toFixed(2)}</p>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex rounded-xl bg-ink-900 border border-ink-800 p-1 gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all",
                tab === t.id ? "bg-ink-700 text-white shadow-sm" : "text-ink-500 hover:text-ink-300")}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      )}

      <div>
        {tab === "search" && showIndiv && (
          <InscriptionSearch tournamentId={tournamentId} participantType={participantType}
            maxParticipants={maxParticipants} currentCount={currentCount}
            registeredUserIds={registeredUserIds} onInscribed={onInscribed}
            gameType={gameType} metric={metric} maxMetric={maxMetric}
            preferredSeason={preferredSeason} />
        )}
        {tab === "manual" && showIndiv && (
          <ManualTab tournamentId={tournamentId} isFull={isFull} onInscribed={onInscribed}
            metric={metric} maxMetric={maxMetric} />
        )}
        {tab === "group" && showGroup && (
          <GroupTab tournamentId={tournamentId} participantType={participantType}
            isFull={isFull} onInscribed={onInscribed} maxMetric={maxMetric} teamSize={teamSize}
            teamSizeMin={teamSizeMin} metricPlayers={metricPlayers} levels={levels} metric={metric} />
        )}
      </div>

      {/* Parejas ciegas sorteo */}
      {showBlind && <BlindPairButton tournamentId={tournamentId} onDone={() => onInscribed("blind-pair")} />}
    </div>
  );
}
