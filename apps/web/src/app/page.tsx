import Link from "next/link";
import Image from "next/image";
import { Trophy, Users, BarChart2, Zap, ChevronRight, Shield, Swords } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink-950 overflow-hidden">

      {/* ── Navbar ─────────────────────────────── */}
      <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-gradient rounded-lg flex items-center justify-center shadow-red-sm">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-white">Dardos</span><span className="text-red-500">DM</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="btn-ghost text-sm">Entrar</Link>
            <Link href="/auth/register" className="btn-primary text-sm py-2 px-4">
              Empezar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero — imagen principal ─ */}
      <section className="relative min-h-[92vh] flex items-center justify-center text-center overflow-hidden">

        {/* Imagen de fondo — priority activa preload automático, crítico para LCP */}
        <Image
          src="/hero-main.webp"
          alt=""
          fill
          priority
          quality={85}
          sizes="100vw"
          style={{
            objectFit: "cover",
            objectPosition: "60% 65%",
            filter: "grayscale(30%) brightness(0.45)",
          }}
        />

        {/* Gradiente desde abajo */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />

        {/* Viñeta lateral */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/70 via-transparent to-ink-950/70" />

        {/* ── Línea roja de acento superior ── */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-90" />

        {/* ── Contenido ── */}
        <div className="relative z-10 px-6 py-24 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 badge-red mb-8 text-sm py-1.5 px-4">
            <Swords className="w-3.5 h-3.5" />
            Brackets · Rankings · Equipos · Inscripciones
          </div>

          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-white leading-none mb-6 tracking-tight drop-shadow-2xl">
            Compite.<br />
            <span className="text-gradient">Domina.</span><br />
            Gana.
          </h1>

          <p className="text-xl text-ink-300 max-w-2xl mx-auto mb-12 leading-relaxed drop-shadow-lg">
            Plataforma de torneos en tiempo real.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/torneos" className="btn-primary text-base py-3.5 px-10 shadow-red-glow">
              Ver torneos activos <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="/registro" className="btn-secondary text-base py-3.5 px-10">
              Crear cuenta gratis
            </Link>
          </div>
        </div>

        {/* ── Flecha scroll ── */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-40">
          <div className="w-px h-10 bg-white" />
          <ChevronRight className="w-4 h-4 text-white rotate-90" />
        </div>
      </section>

      {/* ── Features ───────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-3">Todo lo que necesitas</h2>
          <p className="text-ink-400">Sin límites. Sin dependencias externas.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
          {[
            {
              icon: <Trophy className="w-6 h-6" />,
              title: "3 Formatos",
              desc: "Eliminación simple, doble eliminación y round robin con brackets automáticos.",
              accent: "text-red-400",
              bg: "bg-red-900/20 border-red-900/40",
            },
            {
              icon: <Zap className="w-6 h-6" />,
              title: "Tiempo real",
              desc: "Resultados y brackets actualizados al instante con WebSockets.",
              accent: "text-white",
              bg: "bg-ink-800 border-ink-700",
            },
          ].map((f) => (
            <div key={f.title} className={`rounded-xl p-6 border ${f.bg} flex flex-col gap-4`}>
              <div className={`w-10 h-10 rounded-lg bg-ink-900/60 flex items-center justify-center ${f.accent}`}>
                {f.icon}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">{f.title}</h3>
                <p className="text-ink-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ──────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="bg-gradient-to-br from-red-900/40 to-ink-900 border border-red-900/50
                        rounded-2xl p-12 text-center shadow-red-sm">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-3">¿Listo para competir?</h2>
          <p className="text-ink-400 mb-8 max-w-md mx-auto">
            Regístrate gratis y apúntate a tu primer torneo en minutos.
          </p>
          <Link href="/registro" className="btn-primary text-base py-3 px-10 shadow-red-glow">
            Empezar ahora <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="border-t border-ink-800 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-500">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-red-gradient rounded flex items-center justify-center">
              <Trophy className="w-3 h-3 text-white" />
            </div>
            <span className="text-white">Dardos</span><span className="text-red-500">DM</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <Link href="/privacidad" className="hover:text-ink-300 transition-colors">Política de Privacidad</Link>
            <Link href="/aviso-legal" className="hover:text-ink-300 transition-colors">Aviso Legal</Link>
            <Link href="/cookies" className="hover:text-ink-300 transition-colors">Cookies</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
