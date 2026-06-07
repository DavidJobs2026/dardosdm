"use client";

import { useEffect, useState } from "react";
import { Match, Diana } from "@tournament/types";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { X, Target, Zap } from "lucide-react";
import { clsx } from "clsx";
import { announceMatch } from "@/lib/tts";

interface Props {
  match:        Match;
  tournamentId: string;
  onClose:      () => void;
  onSuccess:    () => void; // refresh bracket data
}

export function BracketLaunchModal({ match, tournamentId, onClose, onSuccess }: Props) {
  const [dianas,   setDianas]   = useState<Diana[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<number | null>(
    match.diana ? match.diana.number : null,
  );
  const [saving,   setSaving]   = useState(false);

  const p1Name = match.participant1?.user?.name ?? match.participant1?.team?.name ?? "Jugador 1";
  const p2Name = match.participant2?.user?.name ?? match.participant2?.team?.name ?? "Jugador 2";
  const p3Name = match.participant3?.user?.name ?? match.participant3?.team?.name ?? undefined;

  useEffect(() => {
    api.get(`/tournaments/${tournamentId}/dianas`)
      .then(r => setDianas(r.data.data ?? []))
      .catch(() => toast.error("No se pudieron cargar las dianas"))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  // Free dianas + the one already assigned to this match
  const available = dianas.filter(d => !d.matchId || d.matchId === match.id);

  const handleLaunch = async () => {
    if (selected === null) { toast.error("Selecciona una diana"); return; }
    setSaving(true);
    try {
      // 1. Assign diana (skip if already assigned to this match)
      if (match.diana?.number !== selected) {
        await api.post(`/tournaments/${tournamentId}/matches/${match.id}/assign-diana`, {
          dianaNumber: selected,
        });
      }
      // 2. Launch — 1st call
      await api.post(`/tournaments/${tournamentId}/matches/${match.id}/launch`);
      toast.success(`Diana ${selected} — 1ª llamada lanzada`);
      // 3. TTS announcement (queued — won't interrupt Gestión announcements)
      void announceMatch(p1Name, p2Name, selected, p3Name);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al lanzar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800
                        bg-gradient-to-r from-orange-900/20 to-transparent">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-bold text-white">Asignar diana y lanzar</h2>
          </div>
          <button onClick={onClose}
            className="text-ink-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-ink-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Player names */}
          <div className="bg-ink-800 border border-ink-700 rounded-xl px-4 py-2.5 text-center">
            {p3Name ? (
              <p className="text-xs text-ink-400 leading-snug space-y-0.5">
                <span className="block text-white font-semibold">{p1Name}</span>
                <span className="block text-white font-semibold">{p2Name}</span>
                <span className="block text-white font-semibold">{p3Name}</span>
              </p>
            ) : (
              <p className="text-xs text-ink-400 leading-snug">
                <span className="text-white font-semibold">{p1Name}</span>
                <span className="text-ink-600 mx-2">vs</span>
                <span className="text-white font-semibold">{p2Name}</span>
              </p>
            )}
          </div>

          {/* Diana selector */}
          <div>
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">
              Selecciona diana
            </p>
            {loading ? (
              <p className="text-xs text-ink-600 text-center py-4">Cargando dianas…</p>
            ) : available.length === 0 ? (
              <p className="text-xs text-ink-600 text-center py-4">No hay dianas disponibles</p>
            ) : (
              <select
                value={selected ?? ""}
                onChange={e => setSelected(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-9 px-3 rounded-lg bg-ink-800 border border-ink-700 text-white text-sm focus:outline-none focus:border-orange-600 cursor-pointer"
              >
                <option value="" disabled>Elige una diana…</option>
                {available.map(d => (
                  <option key={d.number} value={d.number}>Diana {d.number}</option>
                ))}
              </select>
            )}
          </div>

          {/* Launch button */}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={saving || selected === null || loading}
            className={clsx(
              "w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              selected !== null && !saving
                ? "bg-orange-600 hover:bg-orange-500 text-white shadow-lg"
                : "bg-ink-800 text-ink-600 cursor-not-allowed",
            )}
          >
            <Zap className="w-4 h-4" />
            {saving ? "Lanzando…" : selected !== null ? `Lanzar en Diana ${selected}` : "Selecciona una diana"}
          </button>
        </div>
      </div>
    </div>
  );
}
