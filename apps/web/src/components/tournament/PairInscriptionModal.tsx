"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Search, X, UserPlus, Check, AlertTriangle, Loader2, Users } from "lucide-react";

const MIN_GAMES = 18;

interface SeasonRow {
  season: string; gameType: string | null;
  ppd: number | null; mpr: number | null; combined: number | null;
  gamesPlayed: number | null; level: string | null;
}
interface RecordResult {
  name: string; teamName: string | null; provincia: string | null;
  seasons: SeasonRow[];
  avgPpd: number | null; avgMpr: number | null; avgCombined: number | null;
}
interface Partner {
  name: string;
  metricValue: number | null;
  mpr: number | null;
  ppd: number | null;
  source: string | null;
  gamesPlayed: number | null;
}

function metricOf(r: RecordResult, metric: string): number | null {
  if (metric === "mpr") return r.avgMpr;
  if (metric === "ppd") return r.avgPpd;
  return r.avgCombined;
}
// Total games across the player's seasons (matches how the organizer flow counts them)
function gamesOf(r: RecordResult): number | null {
  const sum = r.seasons.reduce((s, x) => s + (x.gamesPlayed ?? 0), 0);
  return sum > 0 ? sum : null;
}

export function PairInscriptionModal({
  tournamentId, tournamentName, metric, gameType, requiredPartners, onClose, onSuccess,
}: {
  tournamentId: string;
  tournamentName: string;
  metric: string;                 // "combined" | "mpr" | "ppd"
  gameType?: string | null;
  requiredPartners: number;       // parejas → 1, tríos → 2, equipos → teamSize-1
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<RecordResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [groupName, setGroupName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupLabel = requiredPartners === 1 ? "pareja" : "equipo";

  // ── Own metric ─────────────────────────────────────────────────────────────
  // Fetch the player's own metric/games. If they have none in the historical DB,
  // we ask them to type it (otherwise the pair limit can't be checked).
  const [selfLoading, setSelfLoading] = useState(true);
  const [selfHasMetric, setSelfHasMetric] = useState(false);
  const [selfMetric, setSelfMetric] = useState<number | null>(null);
  const [selfGames, setSelfGames]   = useState<number | null>(null);
  const [selfMprInput, setSelfMprInput]   = useState("");
  const [selfPpdInput, setSelfPpdInput]   = useState("");
  const [selfGamesInput, setSelfGamesInput] = useState("");
  const [noteInput, setNoteInput]         = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/tournaments/${tournamentId}/my-group-metric`);
        if (cancelled) return;
        setSelfHasMetric(!!data.data?.hasMetric);
        setSelfMetric(data.data?.metricValue ?? null);
        setSelfGames(data.data?.gamesPlayed ?? null);
      } catch {
        if (!cancelled) setSelfHasMetric(false);
      } finally {
        if (!cancelled) setSelfLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  const search = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get("/player-records/search-for-inscription", {
          params: { q: q.trim(), ...(gameType ? { gameType } : {}) },
        });
        setResults(data.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [gameType]);

  useEffect(() => { search(query); }, [query, search]);

  const addPartner = (r: RecordResult) => {
    if (partners.length >= requiredPartners) return;
    if (partners.some(p => p.name.toLowerCase() === r.name.toLowerCase())) {
      toast.error("Ese compañero ya está añadido");
      return;
    }
    setPartners(prev => [...prev, {
      name: r.name,
      metricValue: metricOf(r, metric),
      mpr: r.avgMpr,
      ppd: r.avgPpd,
      source: r.seasons[0]?.season ?? "Histórico",
      gamesPlayed: gamesOf(r),
    }]);
    setQuery("");
    setResults([]);
  };

  const removePartner = (i: number) => setPartners(prev => prev.filter((_, idx) => idx !== i));

  // When the player has no metric on record they must type MPR + PPD; the
  // combined metric is computed automatically (combined = mpr*10 + ppd).
  const needsSelfMetric = !selfLoading && !selfHasMetric;
  const parsedSelfMpr = selfMprInput.trim() !== "" ? Number(selfMprInput.replace(",", ".")) : null;
  const parsedSelfPpd = selfPpdInput.trim() !== "" ? Number(selfPpdInput.replace(",", ".")) : null;
  const parsedSelfGames = selfGamesInput.trim() !== "" ? Math.round(Number(selfGamesInput)) : null;
  const computedCombined = (parsedSelfMpr != null && isFinite(parsedSelfMpr) && parsedSelfPpd != null && isFinite(parsedSelfPpd))
    ? Math.round((parsedSelfMpr * 10 + parsedSelfPpd) * 100) / 100
    : null;
  // Which inputs are required depends on the tournament's metric type
  const selfMetricReady =
    metric === "mpr" ? (parsedSelfMpr != null && isFinite(parsedSelfMpr))
    : metric === "ppd" ? (parsedSelfPpd != null && isFinite(parsedSelfPpd))
    : (computedCombined != null);

  const handleSubmit = async () => {
    if (partners.length !== requiredPartners) {
      toast.error(`Añade ${requiredPartners} compañero${requiredPartners !== 1 ? "s" : ""}`);
      return;
    }
    if (needsSelfMetric && !selfMetricReady) {
      toast.error(metric === "mpr" ? "Introduce tu MPR" : metric === "ppd" ? "Introduce tu PPD" : "Introduce tu MPR y PPD");
      return;
    }
    if (groupName.trim().length < 2) {
      toast.error(`Pon un nombre a la ${groupLabel}`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/tournaments/${tournamentId}/player-inscribe-group`, {
        partners,
        groupName: groupName.trim(),
        ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
        ...(needsSelfMetric ? {
          ...(parsedSelfMpr != null && isFinite(parsedSelfMpr) ? { selfMpr: parsedSelfMpr } : {}),
          ...(parsedSelfPpd != null && isFinite(parsedSelfPpd) ? { selfPpd: parsedSelfPpd } : {}),
          ...(parsedSelfGames != null && isFinite(parsedSelfGames) ? { selfGames: parsedSelfGames } : {}),
        } : {}),
      });
      toast.success("Inscripción de pareja enviada. Pendiente de aprobación.");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al inscribir la pareja");
    } finally {
      setSubmitting(false);
    }
  };

  const metricLabel = metric === "mpr" ? "MPR" : metric === "ppd" ? "PPD" : "Comb.";

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-md bg-ink-900 border border-ink-700 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-5 h-5 text-red-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-white font-bold text-base leading-tight truncate">Inscribir pareja</h2>
              <p className="text-[11px] text-ink-500 truncate">{tournamentName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-white transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Pair / team name */}
          <div>
            <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wide">
              Nombre de la {groupLabel}
            </label>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              maxLength={60}
              placeholder={`Nombre de tu ${groupLabel}…`}
              className="w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white text-sm
                         focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
            />
          </div>

          {/* You (captain) */}
          {selfLoading ? (
            <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-3 text-xs text-ink-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tus datos…
            </div>
          ) : selfHasMetric ? (
            <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-3 text-xs text-ink-400">
              Tú entras como capitán · <span className="text-ink-200 font-semibold">{metricLabel} {selfMetric?.toFixed(2)}</span>
              {selfGames != null && <span className="text-ink-500"> · {selfGames} partidas</span>}
              {selfGames != null && selfGames < MIN_GAMES && (
                <span className="block text-amber-400 mt-1">⚠ Tienes menos de {MIN_GAMES} partidas — el organizador lo revisará</span>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-3 space-y-2.5">
              <p className="text-xs text-amber-300 font-semibold">No tienes media en la base de datos</p>
              <p className="text-[11px] text-amber-200/70 leading-relaxed">Introduce tu MPR y PPD; la combinada se calcula sola. El organizador lo revisará.</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-ink-400 mb-1 uppercase tracking-wide">MPR</label>
                  <input
                    value={selfMprInput}
                    onChange={e => setSelfMprInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="ej. 2.30"
                    className="w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-400 mb-1 uppercase tracking-wide">PPD</label>
                  <input
                    value={selfPpdInput}
                    onChange={e => setSelfPpdInput(e.target.value)}
                    inputMode="decimal"
                    placeholder="ej. 25.5"
                    className="w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-ink-400 mb-1 uppercase tracking-wide">Partidas</label>
                  <input
                    value={selfGamesInput}
                    onChange={e => setSelfGamesInput(e.target.value)}
                    inputMode="numeric"
                    placeholder="ej. 20"
                    className="w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
                  />
                </div>
              </div>
              {/* Auto-computed combined */}
              <div className="text-[11px] text-amber-200/90">
                Combinada (MPR×10 + PPD):{" "}
                <span className="font-bold text-white">{computedCombined != null ? computedCombined.toFixed(2) : "—"}</span>
                {metric !== "combined" && <span className="text-amber-200/60"> · este torneo usa {metricLabel}</span>}
              </div>
              {/* Observations / provenance */}
              <div>
                <label className="block text-[10px] font-semibold text-ink-400 mb-1 uppercase tracking-wide">Observaciones · procedencia de la media</label>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Ej.: media de la liga X temporada 2024, o torneo Y…"
                  className="w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-white text-xs focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600 resize-none"
                />
              </div>
            </div>
          )}

          {/* Selected partners */}
          {partners.length > 0 && (
            <div className="space-y-2">
              {partners.map((p, i) => {
                const lowGames = p.gamesPlayed != null && p.gamesPlayed < MIN_GAMES;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2.5">
                    <div className="w-8 h-8 rounded-lg bg-red-gradient flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-2 text-[11px] mt-0.5">
                        <span className="text-ink-400">{metricLabel}: {p.metricValue != null ? p.metricValue.toFixed(2) : "—"}</span>
                        <span className={lowGames ? "text-amber-400 font-semibold" : "text-ink-500"}>
                          {p.gamesPlayed != null ? `${p.gamesPlayed} partidas` : "sin partidas"}
                        </span>
                      </div>
                      {lowGames && (
                        <p className="flex items-center gap-1 text-[10px] text-amber-400 mt-0.5">
                          <AlertTriangle className="w-3 h-3" /> Menos de {MIN_GAMES} partidas — el organizador lo revisará
                        </p>
                      )}
                    </div>
                    <button onClick={() => removePartner(i)} className="text-ink-500 hover:text-red-400 transition-colors shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search (only if we still need partners) */}
          {partners.length < requiredPartners && (
            <div>
              <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wide">
                Buscar compañero
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Nombre del compañero…"
                  className="w-full pl-9 pr-3 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white text-sm
                             focus:outline-none focus:border-red-500/60 transition-all placeholder-ink-600"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 animate-spin" />}
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                  {results.map((r, i) => {
                    const m  = metricOf(r, metric);
                    const g  = gamesOf(r);
                    const lg = g != null && g < MIN_GAMES;
                    return (
                      <button
                        key={i}
                        onClick={() => addPartner(r)}
                        className="w-full flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-800/40
                                   hover:border-red-700/50 hover:bg-ink-800 px-3 py-2.5 text-left transition-all"
                      >
                        <UserPlus className="w-4 h-4 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                          <div className="flex items-center gap-2 text-[11px] text-ink-500 mt-0.5">
                            <span>{metricLabel}: {m != null ? m.toFixed(2) : "—"}</span>
                            <span className={lg ? "text-amber-400" : ""}>{g != null ? `${g}p` : "—"}</span>
                            {r.teamName && <span className="truncate">· {r.teamName}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {query.trim().length >= 2 && !searching && results.length === 0 && (
                <p className="text-xs text-ink-600 mt-2">No se encontraron jugadores con ese nombre.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-800 shrink-0 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-400 text-sm font-semibold hover:text-white hover:border-ink-500 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting || partners.length !== requiredPartners || groupName.trim().length < 2 || (needsSelfMetric && !selfMetricReady)}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {submitting ? "Enviando…" : "Inscribir pareja"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
