"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Target, RefreshCw, Trophy, Clock, Volume2 } from "lucide-react";
import { clsx } from "clsx";
import type { Diana, Match, Tournament } from "@tournament/types";
import { useSocket } from "@/hooks/useSocket";

interface RefereeAssignment {
  id: string;
  dianaStart: number | null;
  dianaEnd: number | null;
  user: { id: string; name: string; email: string };
}

interface Props {
  tournament: Tournament;
  refereeData: RefereeAssignment;
  onReport: (match: Match) => void;
}

export function RefereeView({ tournament, refereeData, onReport }: Props) {
  const [dianas, setDianas] = useState<Diana[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  // recalling[matchId] = callNumber being sent (for button loading state)
  const [recalling, setRecalling] = useState<Record<string, number>>({});
  const [recallFeedback, setRecallFeedback] = useState<Record<string, string>>({});
  const { onMatchUpdated } = useSocket(tournament.id);

  const isInRange = useCallback((num: number) => {
    const { dianaStart, dianaEnd } = refereeData;
    if (dianaStart == null && dianaEnd == null) return true;
    if (dianaStart != null && dianaEnd != null) return num >= dianaStart && num <= dianaEnd;
    if (dianaStart != null) return num >= dianaStart;
    if (dianaEnd != null) return num <= dianaEnd;
    return true;
  }, [refereeData]);

  const loadData = useCallback(async () => {
    try {
      const [dRes, mRes] = await Promise.all([
        api.get(`/tournaments/${tournament.id}/dianas`),
        api.get(`/tournaments/${tournament.id}/matches`),
      ]);
      setDianas((dRes.data.data ?? []).filter((d: Diana) => isInRange(d.number)));
      setMatches(mRes.data.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tournament.id, isInRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 15s + live socket updates
  useEffect(() => {
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, [loadData]);
  useEffect(() => {
    const unsub = onMatchUpdated(() => loadData());
    return unsub;
  }, [onMatchUpdated, loadData]);

  // Matches active on referee's dianas: launched + not yet completed
  const myDianaNumbers = new Set(dianas.map(d => d.number));
  const activeMatches = matches.filter(m =>
    m.launch1At &&
    m.status !== "completed" &&
    m.status !== "bye" &&
    m.diana &&
    myDianaNumbers.has(m.diana.number)
  );
  // A diana is "in use" only when there's actually a live match at it —
  // d.matchId alone is not enough (it gets set on assignment, before launch)
  const activeDianaNumbers = new Set(activeMatches.map(m => m.diana!.number));

  const handleRecall = useCallback(async (matchId: string, callNumber: number) => {
    setRecalling(prev => ({ ...prev, [matchId]: callNumber }));
    try {
      await api.post(`/tournaments/${tournament.id}/matches/${matchId}/recall`, { callNumber });
      setRecallFeedback(prev => ({ ...prev, [matchId]: `📢 ${callNumber}ª llamada enviada` }));
      setTimeout(() => setRecallFeedback(prev => { const n = { ...prev }; delete n[matchId]; return n; }), 3000);
    } catch {
      setRecallFeedback(prev => ({ ...prev, [matchId]: "Error al enviar" }));
      setTimeout(() => setRecallFeedback(prev => { const n = { ...prev }; delete n[matchId]; return n; }), 3000);
    } finally {
      setRecalling(prev => { const n = { ...prev }; delete n[matchId]; return n; });
    }
  }, [tournament.id]);

  const rangeLabel = refereeData.dianaStart != null
    ? refereeData.dianaEnd != null
      ? `Dianas ${refereeData.dianaStart}–${refereeData.dianaEnd}`
      : `Dianas ${refereeData.dianaStart}+`
    : "Todas las dianas";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-ink-800 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600/30 border border-violet-500/40 flex items-center justify-center">
          <Target className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-violet-400">Árbitro</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 border border-violet-700/40 text-violet-300 font-mono">{rangeLabel}</span>
          </div>
          <p className="text-sm font-bold text-white">{tournament.name}</p>
        </div>
        <button onClick={loadData} className="ml-auto text-ink-500 hover:text-white transition-colors">
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {/* Active matches on my dianas */}
        {activeMatches.length > 0 && (
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-green-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> En juego
            </h2>
            <div className="space-y-2">
              {activeMatches.map(m => {
                const isRecalling = !!recalling[m.id];
                const feedback = recallFeedback[m.id];
                // Determine which recall buttons to show:
                // 2ª always available if match launched; 3ª only if 2ª was already done
                const can2nd = !!m.launch1At;
                const can3rd = !!m.launch2At;
                return (
                  <div key={m.id} className="bg-ink-900 border border-green-800/40 rounded-xl p-3 space-y-2">
                    {/* Row 1: diana + names + result */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-900/30 border border-red-600/40 flex items-center justify-center text-red-300 font-bold text-sm shrink-0">
                        {m.diana?.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {m.participant1?.user?.name ?? m.participant1?.team?.name ?? "—"}
                        </p>
                        <p className="text-xs text-ink-400 truncate">
                          vs {m.participant2?.user?.name ?? m.participant2?.team?.name ?? "—"}
                        </p>
                      </div>
                      <button
                        onClick={() => onReport(m)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-700 hover:bg-green-600 text-white transition-colors shrink-0"
                      >
                        <Trophy className="w-3.5 h-3.5 inline mr-1" />Resultado
                      </button>
                    </div>
                    {/* Row 2: recall buttons */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {feedback ? (
                        <span className="text-xs text-violet-300 font-medium">{feedback}</span>
                      ) : (
                        <>
                          {can2nd && (
                            <button
                              disabled={isRecalling}
                              onClick={() => handleRecall(m.id, 2)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-900/40 border border-violet-700/50 text-violet-300 hover:bg-violet-800/50 disabled:opacity-50 transition-colors"
                            >
                              <Volume2 className="w-3 h-3" />
                              {isRecalling && recalling[m.id] === 2 ? "…" : "2ª llamada"}
                            </button>
                          )}
                          {can3rd && (
                            <button
                              disabled={isRecalling}
                              onClick={() => handleRecall(m.id, 3)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-900/40 border border-orange-700/50 text-orange-300 hover:bg-orange-800/50 disabled:opacity-50 transition-colors"
                            >
                              <Volume2 className="w-3 h-3" />
                              {isRecalling && recalling[m.id] === 3 ? "…" : "3ª llamada"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Diana floor plan */}
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-2">
            Mis dianas
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-ink-600 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : dianas.length === 0 ? (
            <p className="text-sm text-ink-600 italic">Sin dianas asignadas</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dianas.map(d => {
                const occupied = activeDianaNumbers.has(d.number);
                const broken = !!d.broken;
                return (
                  <div key={d.id} className={clsx(
                    "w-14 h-14 rounded-xl border-2 flex flex-col items-center justify-center font-bold text-sm",
                    occupied ? "bg-red-900/40 border-red-600/60 text-red-300" :
                    broken   ? "bg-amber-900/40 border-amber-600/60 text-amber-300" :
                               "bg-green-900/30 border-green-700/40 text-green-400"
                  )}>
                    <span>{d.number}</span>
                    <span className="text-[9px] font-normal opacity-70">
                      {occupied ? "En uso" : broken ? "Avería" : "Libre"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* No active matches message */}
        {!loading && activeMatches.length === 0 && (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 mx-auto mb-2 text-ink-700" />
            <p className="text-ink-600 text-sm">No hay partidos activos en tus dianas</p>
            <p className="text-ink-700 text-xs mt-1">Se actualiza automáticamente cada 15 segundos</p>
          </div>
        )}
      </div>
    </div>
  );
}
