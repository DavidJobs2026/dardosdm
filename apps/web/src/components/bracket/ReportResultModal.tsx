"use client";

import { useState } from "react";
import { Match, Tournament } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { X, Trophy, Swords, User, RotateCcw, Plus, Minus } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  match: Match;
  tournament: Tournament;
  onClose: () => void;
  onSuccess: (updated: Match) => void;
}

// ── Score stepper ──────────────────────────────────────────────────────────────
function ScoreStepper({
  value,
  min,
  max,
  onChange,
  winner,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  winner: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className={clsx(
          "w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all active:scale-95",
          winner
            ? "bg-red-700/60 border-red-500 text-white hover:bg-red-600/70"
            : "bg-ink-700 border-ink-600 text-ink-300 hover:bg-ink-600 hover:border-ink-500"
        )}
      >
        <Plus className="w-5 h-5" />
      </button>

      <span className={clsx(
        "text-6xl font-black w-20 text-center select-none tabular-nums leading-none py-2",
        winner ? "text-red-400" : "text-white"
      )}>
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={clsx(
          "w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all active:scale-95",
          "bg-ink-800 border-ink-700 text-ink-400 hover:bg-ink-700 hover:border-ink-600",
          "disabled:opacity-25 disabled:cursor-not-allowed"
        )}
      >
        <Minus className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export function ReportResultModal({ match, tournament, onClose, onSuccess }: Props) {
  const [score1, setScore1] = useState(match.score1 ?? 0);
  const [score2, setScore2] = useState(match.score2 ?? 0);
  const [loading,   setLoading]   = useState(false);
  const [resetting, setResetting] = useState(false);

  const isEdit = match.status === "completed";

  const p1Name = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
  const p2Name = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
  const p1Id   = match.participant1?.id;
  const p2Id   = match.participant2?.id;

  const levelConfig     = tournament.levels?.find(l => l.name === match.bracketLevel);
  const effectiveBestOf = levelConfig?.bestOf ?? tournament.bestOf ?? 3;
  const winsNeeded      = Math.ceil(effectiveBestOf / 2);
  const winnerOnly      = tournament.winnerOnly;

  const tie        = score1 === score2;
  const p1Wins     = !tie && score1 > score2;
  const p2Wins     = !tie && score2 > score1;
  const winnerName = p1Wins ? p1Name : p2Wins ? p2Name : null;

  const handleResetResult = async () => {
    if (!window.confirm("¿Reiniciar el resultado? Se borrará el resultado actual.")) return;
    setResetting(true);
    try {
      const { data } = await api.post(`/tournaments/${tournament.id}/matches/${match.id}/reset-result`);
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
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800 bg-gradient-to-r from-red-900/20 to-transparent">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">
              {isEdit ? "Editar resultado" : "Reportar resultado"}
            </h2>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-ink-800">
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
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border border-ink-700 bg-ink-800 hover:bg-red-900/30 hover:border-red-600 text-white font-semibold transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
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
          /* ── Score-based mode with steppers ──────────────────────────────── */
          <form onSubmit={handleScoreSubmit} className="p-5 space-y-4">

            {/* BestOf badge */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 bg-ink-800 border border-ink-700 rounded-full px-3 py-1 text-xs text-ink-400">
                <Swords className="w-3 h-3" />
                Mejor de {effectiveBestOf} &mdash; gana con <strong className="text-white">{winsNeeded} legs</strong>
              </span>
            </div>

            {/* Steppers row */}
            <div className="flex items-center gap-4">
              {/* Player 1 */}
              <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide text-center truncate w-full px-1">
                  {p1Name}
                </p>
                <ScoreStepper value={score1} min={0} max={winsNeeded} onChange={setScore1} winner={p1Wins} />
              </div>

              <span className="text-ink-600 font-bold text-lg shrink-0 pb-6">vs</span>

              {/* Player 2 */}
              <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide text-center truncate w-full px-1">
                  {p2Name}
                </p>
                <ScoreStepper value={score2} min={0} max={winsNeeded} onChange={setScore2} winner={p2Wins} />
              </div>
            </div>

            {/* Winner preview */}
            {winnerName ? (
              <div className="flex items-center justify-center gap-2 bg-red-900/20 border border-red-900/50 rounded-xl px-4 py-2.5">
                <Trophy className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm font-semibold text-white">
                  Ganador: <span className="text-red-400">{winnerName}</span>
                </p>
              </div>
            ) : (
              <div className="h-[38px]" />
            )}

            <button
              type="submit"
              disabled={loading || resetting || tie}
              className="btn-primary w-full py-3 text-sm font-bold shadow-red-glow disabled:shadow-none"
            >
              {loading ? "Guardando..." : isEdit ? "Guardar cambio" : "Confirmar resultado"}
            </button>

            {isEdit && (
              <button
                type="button"
                onClick={handleResetResult}
                disabled={loading || resetting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border border-ink-700 text-ink-400 hover:bg-ink-800 hover:text-white transition-all disabled:opacity-40"
              >
                <RotateCcw className={clsx("w-3.5 h-3.5", resetting && "animate-spin")} />
                {resetting ? "Reiniciando…" : "Reiniciar partido"}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
