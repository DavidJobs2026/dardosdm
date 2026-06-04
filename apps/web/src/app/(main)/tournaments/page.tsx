"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Tournament } from "@tournament/types";
import Link from "next/link";
import { Trophy, Calendar, Plus, Search, Trash2, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { clsx } from "clsx";
import toast from "react-hot-toast";

const SERVER_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "http://localhost:4000";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Elim. Simple",
  double_elimination: "Doble Elim.",
  round_robin:        "Round Robin",
};

const STATUS_BADGE: Record<string, string> = {
  draft:       "badge-gray",
  registration:"badge-blue",
  in_progress: "badge-red",
  completed:   "badge-purple",
  cancelled:   "badge-gray",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", registration: "Inscripciones",
  in_progress: "En curso", completed: "Finalizado", cancelled: "Cancelado",
};

const FILTERS = [
  { key: "all",          label: "Todos" },
  { key: "registration", label: "Inscripciones" },
  { key: "in_progress",  label: "En curso" },
  { key: "completed",    label: "Finalizados" },
];

export default function TournamentsPage() {
  const { user } = useAuthStore();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [confirmId, setConfirmId]     = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = filter !== "all" ? { status: filter } : {};
    api.get("/tournaments", { params })
      .then(({ data }) => setTournaments(data.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const filtered = tournaments.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const canCreate = user && (user.role === "organizer" || user.role === "admin");

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await api.delete(`/tournaments/${id}`);
      toast.success("Torneo eliminado");
      setTournaments(prev => prev.filter(t => t.id !== id));
      setConfirmId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Torneos</h1>
          <p className="text-ink-400 mt-1 text-sm">Explora y únete a torneos activos</p>
        </div>
        {canCreate && (
          <Link href="/tournaments/create" className="btn-primary shrink-0">
            <Plus className="w-4 h-4" /> Nuevo torneo
          </Link>
        )}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-ink-900 p-1 rounded-lg border border-ink-800">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-red-600 text-white shadow-red-sm"
                  : "text-ink-400 hover:text-white"
              )}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar torneo..." className="input pl-9 py-2" />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="card animate-pulse h-52 bg-ink-900" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <Trophy className="w-12 h-12 text-ink-800 mx-auto mb-4" />
          <p className="text-ink-500 font-medium">No hay torneos disponibles</p>
          {canCreate && (
            <Link href="/tournaments/create" className="btn-primary mt-6 inline-flex">
              <Plus className="w-4 h-4" /> Crear el primero
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => {
            const canDelete = canCreate && (t.status === "draft" || t.status === "cancelled" || t.status === "completed");
            const isConfirming = confirmId === t.id;
            return (
              <div key={t.id} className="relative group">
                <Link href={`/tournaments/${t.id}`} className="block h-full">
                  <div className="card-hover group h-full flex flex-col overflow-hidden p-0">

                    {/* ── Thumbnail ── */}
                    {t.imageUrl ? (
                      <div className="relative w-full overflow-hidden bg-ink-950" style={{ height: 160 }}>
                        {/* Blurred backdrop */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${SERVER_ORIGIN}${t.imageUrl}`}
                          alt=""
                          aria-hidden
                          className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm opacity-40 pointer-events-none select-none"
                        />
                        {/* Actual poster — contained */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${SERVER_ORIGIN}${t.imageUrl}`}
                          alt={t.name}
                          className="relative z-10 mx-auto block h-full"
                          style={{ maxWidth: "100%", objectFit: "contain" }}
                        />
                        {/* Gradient fade at bottom */}
                        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-ink-900 to-transparent z-20 pointer-events-none" />
                      </div>
                    ) : (
                      /* Placeholder when no image */
                      <div className="w-full flex items-center justify-center border-b border-ink-800 relative overflow-hidden" style={{ height: 80, background: 'linear-gradient(135deg, #1a0808 0%, #0d0d0f 100%)' }}>
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(196,18,48,0.1) 0%, transparent 70%)' }} />
                        <Trophy className="w-8 h-8 relative z-10" style={{ color: 'rgba(255,255,255,0.08)' }} />
                      </div>
                    )}

                    {/* ── Card content ── */}
                    <div className="flex flex-col flex-1 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={STATUS_BADGE[t.status]}>{STATUS_LABELS[t.status]}</span>
                          {!(t as any).isPublic && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-ink-800 text-ink-500 border border-ink-700">
                              🔒 Privado
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-ink-500 bg-ink-800 px-2 py-0.5 rounded-md">
                          {FORMAT_LABELS[t.format]}
                        </span>
                      </div>

                      <h2 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-red-400 transition-colors tracking-wide">
                        {t.name}
                      </h2>
                      {t.description && (
                        <p className="text-ink-400 text-sm mb-4 line-clamp-2 flex-1">{t.description}</p>
                      )}

                      <div className="mb-4 mt-auto">
                        <div className="flex justify-between text-xs text-ink-500 mb-1.5">
                          <span>{t.participantsCount} participantes</span>
                          <span>{t.maxParticipants} max</span>
                        </div>
                        <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
                          <div className="h-full bg-red-gradient rounded-full transition-all"
                            style={{ width: `${Math.min(100, (t.participantsCount / t.maxParticipants) * 100)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-ink-800">
                        {/* Organizer name only visible to admins/organizers, not players */}
                        {canCreate ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-red-900/60 flex items-center justify-center text-xs font-bold text-red-400">
                              {t.organizer.name[0].toUpperCase()}
                            </div>
                            <span className="text-xs text-ink-400">{t.organizer.name}</span>
                          </div>
                        ) : <span />}
                        {t.startDate && (
                          <span className="flex items-center gap-1 text-xs text-ink-500">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(t.startDate), "d MMM", { locale: es })}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                </Link>

                {/* Delete button — draft/cancelled/completed and organizer/admin only */}
                {canDelete && !isConfirming && (
                  <button
                    onClick={e => { e.preventDefault(); setConfirmId(t.id); }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-ink-900/80 border border-ink-700 text-ink-600
                               opacity-0 group-hover:opacity-100 hover:text-red-400 hover:border-red-700/50
                               hover:bg-red-900/20 transition-all"
                    title="Eliminar torneo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Inline confirm overlay */}
                {isConfirming && (
                  <div
                    className="absolute inset-0 rounded-2xl bg-ink-950/95 border border-red-800/60 flex flex-col items-center justify-center gap-4 p-6 z-10"
                    onClick={e => e.preventDefault()}
                  >
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <div className="text-center">
                      <p className="text-white font-bold text-sm">¿Eliminar este torneo?</p>
                      <p className="text-ink-400 text-xs mt-1 line-clamp-1">{t.name}</p>
                      <p className="text-red-400 text-xs mt-2">Esta acción no se puede deshacer</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deleting}
                        className="px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {deleting ? "Eliminando…" : "Sí, eliminar"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-4 py-2 rounded-xl border border-ink-700 text-ink-300 text-xs font-semibold hover:text-white transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
