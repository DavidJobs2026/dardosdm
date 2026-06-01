"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Trophy, LogOut, LayoutDashboard, Menu, X, Database, Target, MonitorX } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { clsx } from "clsx";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

export function Navbar() {
  const { user, logout, logoutAll } = useAuthStore();
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]           = useState(false);
  const [userMenu, setUserMenu]   = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(userMenuRef, () => setUserMenu(false));

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
    <nav className="bg-ink-900 border-b border-ink-800 sticky top-0 z-50">
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
    </nav>
  );
}
