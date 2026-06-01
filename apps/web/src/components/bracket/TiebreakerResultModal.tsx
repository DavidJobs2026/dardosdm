"use client";

import { useState } from "react";
import { Match, Participant } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { clsx } from "clsx";
import { X, Trophy, RefreshCw, Medal } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pName(p?: Participant | null): string {
  return p?.user?.name ?? p?.team?.name ?? "—";
}

function pId(p?: Participant | null): string {
  return p?.id ?? "";
}

// ─── Position badge ───────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: 1 | 2 | 3 }) {
  return (
    <span className={clsx(
      "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0",
      pos === 1 && "bg-yellow-500 text-black",
      pos === 2 && "bg-slate-400 text-black",
      pos === 3 && "bg-amber-700 text-white",
    )}>
      {pos}º
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  match: Match;
  tournamentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function TiebreakerResultModal({ match, tournamentId, onClose, onSuccess }: Props) {
  const players = [match.participant1, match.participant2, match.participant3].filter(Boolean) as Participant[];

  // ranking[i] = participantId assigned to position i+1  (null = unassigned)
  const [ranking, setRanking] = useState<[string | null, string | null, string | null]>(
    [null, null, null]
  );
  const [saving, setSaving] = useState(false);

  const positionLabels = ["1º Clasificado", "2º Clasificado", "3º Clasificado"];

  function assign(slot: 0 | 1 | 2, participantId: string) {
    setRanking(prev => {
      const next = [...prev] as [string | null, string | null, string | null];
      // If the player was already in another slot, clear it first
      for (let i = 0; i < 3; i++) {
        if (next[i] === participantId) next[i] = null;
      }
      next[slot] = participantId;
      return next;
    });
  }

  const allAssigned = ranking.every(r => r !== null);

  const handleSubmit = async () => {
    if (!allAssigned) return;
    setSaving(true);
    try {
      await api.post(`/tournaments/${tournamentId}/matches/${match.id}/tiebreaker-result`, {
        first:  ranking[0],
        second: ranking[1],
        third:  ranking[2],
      });
      toast.success("Resultado de desempate registrado");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al guardar resultado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Resultado de desempate</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-ink-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Info */}
          <p className="text-xs text-ink-400">
            Asigna la posición final de cada jugador en este desempate de 3 vías.
          </p>

          {/* 3 position slots */}
          <div className="space-y-2">
            {([0, 1, 2] as const).map(slot => (
              <div key={slot} className="space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <PosBadge pos={(slot + 1) as 1 | 2 | 3} />
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
                    {positionLabels[slot]}
                  </span>
                </div>

                {/* Player selector — show 3 chips */}
                <div className="flex flex-wrap gap-2 pl-10">
                  {players.map(p => {
                    const id = pId(p);
                    const isSelected = ranking[slot] === id;
                    const takenByOther = !isSelected && ranking.some((r, i) => i !== slot && r === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={takenByOther}
                        onClick={() => assign(slot, id)}
                        className={clsx(
                          "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                          isSelected
                            ? slot === 0
                              ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300"
                              : slot === 1
                                ? "bg-slate-500/20 border-slate-400/50 text-slate-300"
                                : "bg-amber-800/20 border-amber-700/50 text-amber-400"
                            : takenByOther
                              ? "bg-ink-800/30 border-ink-800/30 text-ink-700 cursor-not-allowed opacity-40"
                              : "bg-ink-800 border-ink-700 text-ink-300 hover:border-ink-500 hover:text-white cursor-pointer"
                        )}
                      >
                        {pName(p)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Summary — only shown when all assigned */}
          {allAssigned && (
            <div className="bg-ink-800/50 border border-ink-700 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2">Resumen</p>
              {ranking.map((id, i) => {
                const p = players.find(pl => pId(pl) === id);
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <PosBadge pos={(i + 1) as 1 | 2 | 3} />
                    <span className="text-sm font-semibold text-white">{pName(p)}</span>
                    {i === 0 && <Medal className="w-3.5 h-3.5 text-yellow-400 ml-auto" />}
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!allAssigned || saving}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando…</>
              : <><Trophy className="w-4 h-4" /> Guardar clasificación</>}
          </button>
        </div>
      </div>
    </div>
  );
}
