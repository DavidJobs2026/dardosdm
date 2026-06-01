"use client";

import { useState } from "react";
import { Match, Tournament } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { X, Trophy, Swords, User, RotateCcw } from "lucide-react";

interface Props {
  match: Match;
  tournament: Tournament;
  onClose: () => void;
  onSuccess: (updated: Match) => void;
}

export function ReportResultModal({ match, tournament, onClose, onSuccess }: Props) {
  // Pre-fill with existing scores if this is an edit of a completed match
  const [score1, setScore1] = useState(match.score1 ?? 0);
  const [score2, setScore2] = useState(match.score2 ?? 0);
  const [loading,   setLoading]   = useState(false);
  const [resetting, setResetting] = useState(false);

  const isEdit = match.status === "completed";

  const p1Name = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
  const p2Name = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
  const p1Id   = match.participant1?.id;
  const p2Id   = match.participant2?.id;

  // Compute effective bestOf for this match (level override > global)
  const levelConfig = tournament.levels?.find(l => l.name === match.bracketLevel);
  const effectiveBestOf = levelConfig?.bestOf ?? tournament.bestOf ?? 3;
  const winsNeeded      = Math.ceil(effectiveBestOf / 2);
  const winnerOnly      = tournament.winnerOnly;

  // Score-mode derived state
  const tie    = score1 === score2;
  const winnerName = !tie ? (score1 > score2 ? p1Name : p2Name) : null;

  const handleResetResult = async () => {
    if (!window.confirm("¿Reiniciar el resultado de este partido? Se borrará el resultado actual y podrás introducirlo de nuevo.")) return;
    setResetting(true);
    try {
      const { data } = await api.post(
        `/tournaments/${tournament.id}/matches/${match.id}/reset-result`
      );
      toast.success("Resultado reiniciado");
      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al reiniciar");
    } finally {
      setResetting(false);
    }
  };

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tie) { toast.error("No puede haber empate"); return; }
    const maxScore = Math.max(score1, score2);
    if (maxScore !== winsNeeded) {
      toast.error(`El ganador debe tener exactamente ${winsNeeded} legs (BO${effectiveBestOf})`);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post(
        `/tournaments/${tournament.id}/matches/${match.id}/result`,
        { score1, score2 }
      );
      toast.success("Resultado registrado");
      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleWinnerOnly = async (winnerId: string) => {
    setLoading(true);
    try {
      const { data } = await api.post(
        `/tournaments/${tournament.id}/matches/${match.id}/result`,
        { winnerId }
      );
      toast.success("Ganador registrado");
      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800
                        bg-gradient-to-r from-red-900/20 to-transparent">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">
              {isEdit ? "Editar resultado" : "Reportar resultado"}
            </h2>
          </div>
          <button onClick={onClose}
            className="text-ink-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-ink-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {winnerOnly ? (
          /* ── Winner-only mode ─────────────────────────────────────────────── */
          <div className="p-5 space-y-3">
            <p className="text-xs text-ink-500 text-center">Selecciona al ganador del partido</p>
            {[{ id: p1Id, name: p1Name }, { id: p2Id, name: p2Name }].map(({ id, name }) => (
              <button
                key={id}
                disabled={loading || !id}
                onClick={() => id && handleWinnerOnly(id)}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border
                           border-ink-700 bg-ink-800 hover:bg-red-900/30 hover:border-red-600
                           text-white font-semibold transition-all text-left
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-full bg-ink-700 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-ink-400" />
                </div>
                <span className="flex-1 leading-snug">{name}</span>
                <Trophy className="w-4 h-4 text-red-400 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          /* ── Score-based mode ─────────────────────────────────────────────── */
          <form onSubmit={handleScoreSubmit} className="p-5 space-y-4">

            {/* BestOf badge */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 bg-ink-800 border border-ink-700
                               rounded-full px-3 py-1 text-xs text-ink-400">
                <Swords className="w-3 h-3" />
                Mejor de {effectiveBestOf} &mdash; gana con{" "}
                <strong className="text-white">{winsNeeded} legs</strong>
              </span>
            </div>

            {/* Player names row */}
            <div className="flex items-start gap-3">
              <p className="flex-1 text-center text-[11px] font-bold text-ink-300 uppercase tracking-wide leading-snug">
                {p1Name}
              </p>
              <div className="w-8 shrink-0" /> {/* spacer for "vs" column */}
              <p className="flex-1 text-center text-[11px] font-bold text-ink-300 uppercase tracking-wide leading-snug">
                {p2Name}
              </p>
            </div>

            {/* Score inputs row */}
            <div className="flex items-center gap-3">
              <input
                type="number" min={0} max={winsNeeded} value={score1}
                onChange={e => setScore1(Number(e.target.value))}
                className={`flex-1 text-center text-5xl font-black rounded-xl py-4 border
                            focus:outline-none transition-all
                            ${!tie && score1 > score2
                              ? "bg-red-900/30 border-red-600 text-red-400"
                              : "bg-ink-800 border-ink-700 text-white focus:border-red-500"}`}
              />
              <span className="w-8 text-center text-ink-600 font-bold text-lg shrink-0">vs</span>
              <input
                type="number" min={0} max={winsNeeded} value={score2}
                onChange={e => setScore2(Number(e.target.value))}
                className={`flex-1 text-center text-5xl font-black rounded-xl py-4 border
                            focus:outline-none transition-all
                            ${!tie && score2 > score1
                              ? "bg-red-900/30 border-red-600 text-red-400"
                              : "bg-ink-800 border-ink-700 text-white focus:border-red-500"}`}
              />
            </div>

            {/* Winner preview */}
            {winnerName ? (
              <div className="flex items-center justify-center gap-2 bg-red-900/20 border border-red-900/50
                              rounded-xl px-4 py-2.5">
                <Trophy className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm font-semibold text-white leading-snug">
                  Ganador: <span className="text-red-400">{winnerName}</span>
                </p>
              </div>
            ) : (
              <div className="h-[38px]" /> /* placeholder to avoid layout jump */
            )}

            <button type="submit" disabled={loading || resetting || tie}
              className="btn-primary w-full py-3 text-sm font-bold shadow-red-glow disabled:shadow-none">
              {loading ? "Guardando..." : isEdit ? "Guardar cambio" : "Confirmar resultado"}
            </button>

            {/* Reset button — only shown when editing a completed match */}
            {isEdit && (
              <button
                type="button"
                onClick={handleResetResult}
                disabled={loading || resetting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2
                           border border-ink-700 text-ink-400 hover:bg-ink-800 hover:text-white
                           transition-all disabled:opacity-40"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${resetting ? "animate-spin" : ""}`} />
                {resetting ? "Reiniciando…" : "Reiniciar partido"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
