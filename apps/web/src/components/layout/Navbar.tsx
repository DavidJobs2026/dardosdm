"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Trophy, LogOut, LayoutDashboard, Menu, X, Database, Target, MonitorX, KeyRound, Eye, EyeOff, Bell, BellOff } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { clsx } from "clsx";
import { useRef, useState, useEffect } from "react";
import toast from "react-hot-toast";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { api } from "@/lib/api";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// Build-time commit injected by Next.js via NEXT_PUBLIC_COMMIT_SHA env var
const LOCAL_COMMIT = (process.env.NEXT_PUBLIC_COMMIT_SHA ?? "local").slice(0, 7);

export function Navbar() {
  const { user, logout, logoutAll } = useAuthStore();
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]           = useState(false);
  const [userMenu, setUserMenu]   = useState(false);
  const [serverCommit, setServerCommit] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(userMenuRef, () => setUserMenu(false));

  // Poll server version every 60s — shows a badge when the deployed backend
  // has a different commit than what the frontend was built with
  useEffect(() => {
    const check = () => {
      api.get("/version").then(({ data }) => {
        setServerCommit(data.commit ?? null);
      }).catch(() => {});
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  const versionMismatch = serverCommit && LOCAL_COMMIT !== "local" && serverCommit !== LOCAL_COMMIT;
  const { isSupported, isSubscribed, isLoading: pushLoading, subscribe, needsInstall } = usePushNotifications();

  // ── Change password modal ────────────────────────────────────────────────────
  const [showChangePw,   setShowChangePw]   = useState(false);
  const [currentPw,      setCurrentPw]      = useState("");
  const [newPw,          setNewPw]          = useState("");
  const [showCurrentPw,  setShowCurrentPw]  = useState(false);
  const [showNewPw,      setShowNewPw]      = useState(false);
  const [savingPw,       setSavingPw]       = useState(false);

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    setSavingPw(true);
    try {
      await api.patch("/auth/me/password", { currentPassword: currentPw, newPassword: newPw });
      toast.success("Contraseña actualizada");
      setShowChangePw(false);
      setCurrentPw(""); setNewPw("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al cambiar la contraseña");
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Sesión cerrada");
    router.push("/");
  };

  const handleLogoutAll = async () => {
    await logoutAll();
    toast.success("Todas las sesiones cerradas");
    router.push("/");
  };

  const active = (href: string) => pathname.startsWith(href);

  // Role-aware nav links
  const isPlayer    = user?.role === "player";
  const isOrganizer = user?.role === "organizer" || user?.role === "admin";

  const navLinks = isPlayer
    ? [{ href: "/torneos", label: "Torneos", icon: Trophy }]
    : [
        { href: "/tournaments", label: "Torneos",   icon: Trophy },
        { href: "/historico",   label: "Histórico", icon: Database },
      ];

  const roleLabel = user?.role === "admin" ? "Super Admin" : user?.role === "organizer" ? "Organizador" : "Jugador";
  const roleColor = user?.role === "admin" ? "text-yellow-400" : user?.role === "player" ? "text-ink-400" : "text-red-400";

  return (
    <nav className="bg-ink-950/95 backdrop-blur-sm border-b border-ink-800 sticky top-0 z-50 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-red-600/40 after:to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href={isPlayer ? "/torneos" : "/dashboard"} className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-8 h-8 bg-red-gradient rounded-lg flex items-center justify-center
                            shadow-red-sm group-hover:shadow-red-glow transition-shadow">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold hidden sm:block tracking-tight">
              <span className="text-white">Dardos</span><span className="text-red-500">DM</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active(href)
                    ? "bg-red-900/40 text-red-400 border border-red-900/60"
                    : "text-ink-400 hover:text-white hover:bg-ink-800"
                )}>
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>

          {/* User */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {isOrganizer && (
                  <Link href="/dashboard"
                    className={clsx(
                      "hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      active("/dashboard")
                        ? "bg-red-900/40 text-red-400 border border-red-900/60"
                        : "text-ink-400 hover:text-white hover:bg-ink-800"
                    )}>
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                )}

                <div className="flex items-center gap-2.5 pl-2 border-l border-ink-700">
                  <div className="w-8 h-8 rounded-lg bg-red-gradient flex items-center
                                  justify-center text-sm font-bold text-white shadow-red-sm">
                    {user.name[0].toUpperCase()}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-semibold text-white leading-none">{user.name}</p>
                    <p className={clsx("text-xs mt-0.5 font-medium", roleColor)}>
                      {roleLabel}
                    </p>
                  </div>
                </div>

                <div className="relative ml-1" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                               text-ink-400 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:block">Salir</span>
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-ink-900 border border-ink-700
                                    rounded-xl shadow-xl z-50 overflow-hidden">
                      <button
                        onClick={() => { setUserMenu(false); setShowChangePw(true); }}
                        className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-ink-300
                                   hover:bg-ink-800 hover:text-white transition-colors text-left">
                        <KeyRound className="w-4 h-4 text-ink-500" />
                        Cambiar contraseña
                      </button>
                      {/* Push notification toggle — always accessible so players can re-activate */}
                      {isSupported && (
                        <>
                          <div className="border-t border-ink-800" />
                          <button
                            onClick={() => { setUserMenu(false); subscribe(); }}
                            disabled={pushLoading || isSubscribed}
                            className="flex items-center gap-2.5 w-full px-4 py-3 text-sm transition-colors text-left
                                       disabled:opacity-50 disabled:cursor-not-allowed
                                       text-ink-300 hover:bg-ink-800 hover:text-white">
                            {isSubscribed
                              ? <><BellOff className="w-4 h-4 text-green-500" /><span className="text-green-400">Notificaciones activas</span></>
                              : <><Bell className="w-4 h-4 text-amber-400" /><span className="text-amber-300">Activar notificaciones</span></>
                            }
                          </button>
                        </>
                      )}
                      <div className="border-t border-ink-800" />
                      <button
                        onClick={() => { setUserMenu(false); handleLogout(); }}
                        className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-ink-300
                                   hover:bg-ink-800 hover:text-white transition-colors text-left">
                        <LogOut className="w-4 h-4 text-ink-500" />
                        Cerrar esta sesión
                      </button>
                      <div className="border-t border-ink-800" />
                      <button
                        onClick={() => { setUserMenu(false); handleLogoutAll(); }}
                        className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-400
                                   hover:bg-red-900/20 transition-colors text-left">
                        <MonitorX className="w-4 h-4" />
                        Cerrar todos los dispositivos
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/auth/login"   className="btn-ghost text-sm">Entrar</Link>
                <Link href="/registro" className="btn-primary text-sm py-2 px-4">Registro</Link>
              </div>
            )}

            <button className="md:hidden p-2 text-ink-400 hover:text-white rounded-lg"
              onClick={() => setOpen(!open)}>
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-ink-800 bg-ink-900 px-4 py-3 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}
              className={clsx(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium",
                active(href) ? "bg-red-900/40 text-red-400" : "text-ink-400 hover:text-white hover:bg-ink-800"
              )}>
              <Icon className="w-4 h-4" />{label}
            </Link>
          ))}
          {isOrganizer && (
            <Link href="/dashboard" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-ink-400">
              <LayoutDashboard className="w-4 h-4" />Dashboard
            </Link>
          )}
          <button onClick={() => { setOpen(false); handleLogout(); }}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-ink-400 hover:text-white hover:bg-ink-800 transition-colors">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
          <button onClick={() => { setOpen(false); handleLogoutAll(); }}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 transition-colors">
            <MonitorX className="w-4 h-4" /> Cerrar todos los dispositivos
          </button>
        </div>
      )}

      {/* Change password modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-400" />
                <h2 className="text-white font-bold text-base">Cambiar contraseña</h2>
              </div>
              <button onClick={() => { setShowChangePw(false); setCurrentPw(""); setNewPw(""); }}
                className="text-ink-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePw} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wide">
                  Contraseña actual
                </label>
                <div className="relative">
                  <input value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                    type={showCurrentPw ? "text" : "password"} autoFocus required
                    className="w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white
                               text-sm focus:outline-none focus:border-red-500/60 transition-all pr-10" />
                  <button type="button" onClick={() => setShowCurrentPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors">
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wide">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input value={newPw} onChange={e => setNewPw(e.target.value)}
                    type={showNewPw ? "text" : "password"} required
                    placeholder="Mín. 8 · mayúscula · número · símbolo"
                    className="w-full px-3.5 py-2.5 bg-ink-950 border border-ink-700 rounded-xl text-white
                               text-sm focus:outline-none focus:border-red-500/60 transition-all pr-10 placeholder-ink-600" />
                  <button type="button" onClick={() => setShowNewPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowChangePw(false); setCurrentPw(""); setNewPw(""); }}
                  className="flex-1 py-2.5 rounded-xl border border-ink-700 text-ink-400 text-sm font-semibold
                             hover:text-white hover:border-ink-500 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingPw}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold
                             transition-colors disabled:opacity-50">
                  {savingPw ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version badge — always visible at bottom of navbar for admins/organizers */}
      {user && (user.role === "admin" || user.role === "organizer") && serverCommit && (
        <div className={clsx(
          "flex items-center justify-center gap-2 px-4 py-1.5 text-[11px] font-mono border-t",
          versionMismatch
            ? "bg-amber-900/40 border-amber-700/60 text-amber-300"
            : "bg-ink-900 border-ink-700 text-ink-300"
        )}>
          {versionMismatch ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>
                ⚠ Frontend <strong className="text-white">v.{LOCAL_COMMIT}</strong>
                {" · "}
                Servidor <strong className="text-white">v.{serverCommit}</strong>
                {" — "}
                <span className="text-amber-200">deploy pendiente</span>
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span>
                <strong className="text-white">v.{serverCommit}</strong>
                <span className="text-green-400 ml-1.5">✓ sincronizado</span>
              </span>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
