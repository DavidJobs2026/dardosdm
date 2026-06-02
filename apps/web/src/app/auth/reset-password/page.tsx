"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Trophy, Lock, ChevronRight, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [password,   setPassword]   = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    if (!token) setError("El enlace no es válido. Solicita uno nuevo.");
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || "El enlace no es válido o ha expirado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 bg-red-gradient rounded-xl flex items-center justify-center shadow-red-sm">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Dardos<span className="text-red-500">DM</span></span>
        </div>

        {success ? (
          /* ── Success ── */
          <div className="text-center">
            <div className="w-16 h-16 bg-green-900/30 border border-green-700/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">¡Contraseña actualizada!</h1>
            <p className="text-ink-400 text-sm mb-6">
              Tu contraseña ha sido cambiada correctamente.<br />
              Redirigiendo al inicio de sesión…
            </p>
            <Link href="/auth/login" className="btn-primary inline-flex items-center gap-2 py-2.5 px-6">
              Ir al inicio de sesión
            </Link>
          </div>
        ) : !token ? (
          /* ── Invalid token ── */
          <div className="text-center">
            <div className="w-16 h-16 bg-red-900/30 border border-red-700/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">Enlace no válido</h1>
            <p className="text-ink-400 text-sm mb-6">
              Este enlace de restablecimiento no es válido o ha expirado.
            </p>
            <Link href="/auth/forgot-password" className="btn-primary inline-flex items-center gap-2 py-2.5 px-6">
              Solicitar nuevo enlace
            </Link>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <h1 className="text-3xl font-black text-white mb-1">Nueva contraseña</h1>
            <p className="text-ink-400 mb-8 text-sm">
              Elige una contraseña segura para tu cuenta.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-10 pr-10"
                    placeholder="Mínimo 6 caracteres"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input pl-10"
                    placeholder="Repite la contraseña"
                    required
                  />
                </div>
                {confirm && password !== confirm && (
                  <p className="text-red-400 text-xs mt-1.5">Las contraseñas no coinciden</p>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-700/40 bg-red-900/20 p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-red-300 text-xs">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="btn-primary w-full py-3 text-base shadow-red-glow"
              >
                {loading ? "Guardando..." : <>Cambiar contraseña <ChevronRight className="w-4 h-4" /></>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
