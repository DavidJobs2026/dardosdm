"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Tournament } from "@tournament/types";
import { useAuthStore } from "@/store/auth.store";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import toast from "react-hot-toast";
import {
  Trophy, Users, Calendar, Bell, Loader2, Swords, Clock, CheckCircle, Play,
} from "lucide-react";
import { clsx } from "clsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const SERVER_ORIGIN = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "http://localhost:4000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:        "badge-gray",
  registration: "badge-blue",
  in_progress:  "badge-red",
  completed:    "badge-purple",
  cancelled:    "badge-gray",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador", registration: "Inscripciones",
  in_progress: "En curso", completed: "Finalizado", cancelled: "Cancelado",
};
const FORMAT_SHORT: Record<string, string> = {
  single_elimination: "Elim. Simple",
  double_elimination: "Doble Elim.",
  round_robin: "Round Robin",
};
const PARTICIPANT_LABELS: Record<string, string> = {
  individual: "Individual", parejas: "Parejas", parejas_ciegas: "Parejas Ciegas",
  trios: "Tríos", equipos: "Equipos",
};

// State per tournament for inscription
type InscriptionState = "none" | "pending" | "confirmed" | "loading";

// ─── Tournament card ──────────────────────────────────────────────────────────

function TournamentCard({
  tournament,
  userId,
}: {
  tournament: Tournament & { _inscriptionStatus?: "none" | "pending" | "confirmed" };
  userId: string;
}) {
  const [inscriptionState, setInscriptionState] = useState<InscriptionState>(
    tournament._inscriptionStatus ?? "none"
  );

  const canInscribe =
    (tournament as any).allowPlayerReg &&
    tournament.status === "registration" &&
    inscriptionState === "none";

  const handleInscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInscriptionState("loading");
    try {
      await api.post(`/tournaments/${tournament.id}/player-inscribe`);
      setInscriptionState("pending");
      toast.success("Solicitud enviada. Pendiente de aprobación.");
    } catch (err: any) {
      setInscriptionState("none");
      toast.error(err.response?.data?.message || "Error al inscribirse");
    }
  };

  const imageUrl = tournament.imageUrl
    ? `${SERVER_ORIGIN}${tournament.imageUrl}`
    : null;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="block bg-ink-900 border border-ink-800 rounded-2xl overflow-hidden hover:border-ink-600 transition-all group"
    >
      {/* Image */}
      <div className="relative h-40 bg-ink-800 overflow-hidden">
        {imageUrl ? (
          <>
            {/* Blurred backdrop */}
            <div
              className="absolute inset-0 scale-110 blur-sm opacity-60"
              style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
            <img
              src={imageUrl}
              alt={tournament.name}
              className="relative w-full h-full object-contain"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Trophy className="w-12 h-12 text-ink-700" />
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-3 left-3">
          <span className={STATUS_BADGE[tournament.status]}>{STATUS_LABELS[tournament.status]}</span>
        </div>

        {/* allowPlayerReg badge */}
        {(tournament as any).allowPlayerReg && tournament.status === "registration" && (
          <div className="absolute top-3 right-3">
            <span className="badge-green">Inscripciones abiertas</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5">
        <h3 className="text-white font-black text-lg leading-tight group-hover:text-red-400 transition-colors truncate">
          {tournament.name}
        </h3>

        <div className="flex items-center gap-3 mt-2 text-xs text-ink-500">
          <span>{FORMAT_SHORT[tournament.format]}</span>
          <span className="text-ink-700">·</span>
          <span>{PARTICIPANT_LABELS[tournament.participantType]}</span>
        </div>

        {tournament.startDate && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-ink-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{format(new Date(tournament.startDate), "d MMM yyyy · HH:mm", { locale: es })}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          {/* Participants count */}
          <div className="flex items-center gap-1.5 text-xs text-ink-400">
            <Users className="w-3.5 h-3.5" />
            <span>
              {tournament.participantsCount}
              {tournament.maxParticipants > 0 && `/${tournament.maxParticipants}`} participantes
            </span>
          </div>

          {/* Inscription button */}
          {(tournament as any).allowPlayerReg && tournament.status === "registration" && (
            <div>
              {inscriptionState === "loading" ? (
                <span className="flex items-center gap-1.5 text-xs text-ink-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </span>
              ) : inscriptionState === "pending" ? (
                <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-700/40">
                  <Clock className="w-3.5 h-3.5" />
                  Pendiente
                </span>
              ) : inscriptionState === "confirmed" ? (
                <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-900/20 px-3 py-1.5 rounded-lg border border-green-700/40">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Inscrito
                </span>
              ) : (
                <button
                  onClick={handleInscribe}
                  className="btn-primary text-xs py-1.5 px-3 shadow-red-sm"
                >
                  <Play className="w-3 h-3" />
                  Inscribirme
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TorneosPage() {
  const { user } = useAuthStore();
  const authInitialized = useAuthStore((s) => s.authInitialized);
  const router = useRouter();
  const [tournaments, setTournaments] = useState<(Tournament & { _inscriptionStatus?: "none" | "pending" | "confirmed" })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe, needsInstall } = usePushNotifications();

  useEffect(() => {
    // Wait for the cookie→token bootstrap before redirecting, so a reload doesn't
    // bounce to login while the session is still being restored.
    if (!authInitialized) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (user.role !== "player") {
      router.push("/dashboard");
      return;
    }

    const loadTournaments = async () => {
      try {
        const { data } = await api.get("/tournaments?limit=50");
        const list = data.data as Tournament[];

        // For each tournament in registration that allows player reg, check the user's status
        const enriched = await Promise.all(
          list.map(async (t) => {
            if ((t as any).allowPlayerReg && t.status === "registration") {
              try {
                const { data: pData } = await api.get(`/tournaments/${t.id}/participants`);
                const participants = pData.data as any[];
                const mine = participants.find((p: any) =>
                  p.user?.id === user.id ||
                  p.userId  === user.id  ||
                  // organizer may have inscribed via historico (linked by DNI, no userId yet)
                  (user.dni && p.dni && p.dni.toUpperCase() === user.dni.toUpperCase())
                );
                if (mine) {
                  const status = mine.inscriptionStatus;
                  const mapped = status === "confirmed" ? "confirmed" : "pending";
                  return { ...t, _inscriptionStatus: mapped as "confirmed" | "pending" };
                }
              } catch {
                // ignore errors for participant fetch
              }
            }
            return { ...t, _inscriptionStatus: "none" as const };
          })
        );

        setTournaments(enriched);
      } catch {
        toast.error("Error al cargar los torneos");
      } finally {
        setLoading(false);
      }
    };

    loadTournaments();
  }, [user, authInitialized, router]);

  if (!user || user.role !== "player") return null;

  const openTournaments = tournaments.filter(t => t.status === "registration" || t.status === "in_progress");
  const otherTournaments = tournaments.filter(t => t.status !== "registration" && t.status !== "in_progress");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-ink-500 text-sm font-medium uppercase tracking-widest mb-1">Jugador</p>
        <h1 className="text-4xl font-black text-white tracking-tight">
          Hola, <span className="text-gradient">{user.name}</span>
        </h1>
        <p className="text-ink-400 text-sm mt-1">Explora los torneos disponibles y solicita tu inscripción</p>
      </div>

      {/* Email verification banner */}
      {user.emailVerified === false && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 flex items-start gap-3">
          <span className="text-yellow-400 text-lg shrink-0 mt-0.5">✉️</span>
          <div className="flex-1 min-w-0">
            <p className="text-yellow-300 font-semibold text-sm">Verifica tu email</p>
            <p className="text-yellow-400/70 text-xs mt-0.5 leading-relaxed">
              Hemos enviado un enlace de verificación a <strong className="text-yellow-300">{user.email}</strong>. Confírmalo para activar todas las funciones.
            </p>
          </div>
          <Link
            href="/verificar-email/pendiente"
            className="shrink-0 px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-600/40 text-yellow-300 text-xs font-semibold hover:bg-yellow-600/30 transition-colors"
          >
            Reenviar
          </Link>
        </div>
      )}

      {/* Push notification banner — standard browsers */}
      {isSupported && !isSubscribed && !dismissedBanner && (
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Activa las notificaciones</p>
            <p className="text-ink-500 text-xs">Recibirás un aviso cuando te llamen a una diana</p>
          </div>
          <button
            onClick={subscribe}
            disabled={pushLoading}
            className="btn-primary text-xs py-1.5 px-3 shrink-0"
          >
            {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Activar"}
          </button>
          <button
            onClick={() => setDismissedBanner(true)}
            className="text-ink-600 hover:text-ink-400 transition-colors text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* iOS install hint — push only works in installed PWA on iOS */}
      {needsInstall && !dismissedBanner && (
        <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 flex items-center gap-3">
          <Bell className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Instala la app para notificaciones</p>
            <p className="text-ink-500 text-xs">
              En iPhone: pulsa <span className="text-white">Compartir</span> → <span className="text-white">Añadir a pantalla de inicio</span>
            </p>
          </div>
          <button
            onClick={() => setDismissedBanner(true)}
            className="text-ink-600 hover:text-ink-400 transition-colors text-xs shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active tournaments */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-ink-600 animate-spin" />
        </div>
      ) : (
        <>
          {openTournaments.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Torneos abiertos</h2>
                <span className="text-xs text-ink-500">{openTournaments.length} torneos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {openTournaments.map(t => (
                  <TournamentCard key={t.id} tournament={t} userId={user.id} />
                ))}
              </div>
            </section>
          )}

          {otherTournaments.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Historial de torneos</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherTournaments.map(t => (
                  <TournamentCard key={t.id} tournament={t} userId={user.id} />
                ))}
              </div>
            </section>
          )}

          {tournaments.length === 0 && (
            <div className="card text-center py-20 border-dashed border-ink-700">
              <Swords className="w-12 h-12 text-ink-800 mx-auto mb-4" />
              <p className="text-ink-500 text-lg font-semibold">No hay torneos disponibles</p>
              <p className="text-ink-600 text-sm mt-1">Vuelve pronto para ver los próximos torneos</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
