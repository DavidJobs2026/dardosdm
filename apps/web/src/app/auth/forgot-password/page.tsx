"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Trophy, Mail, ChevronRight, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Error al enviar el email. Inténtalo de nuevo.");
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

        {sent ? (
          /* ── Success state ── */
          <div className="text-center">
            <div className="w-16 h-16 bg-green-900/30 border border-green-700/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">Revisa tu email</h1>
            <p className="text-ink-400 text-sm leading-relaxed mb-8">
              Si existe una cuenta con <strong className="text-white">{email}</strong>, recibirás
              un enlace para restablecer tu contraseña en los próximos minutos.
              Revisa también la carpeta de spam.
            </p>
            <Link
              href="/auth/login"
              className="btn-primary inline-flex items-center gap-2 py-2.5 px-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <h1 className="text-3xl font-black text-white mb-1">¿Olvidaste tu contraseña?</h1>
            <p className="text-ink-400 mb-8 text-sm">
              Introduce tu email y te enviaremos un enlace para restablecerla.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="tu@email.com"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full py-3 text-base shadow-red-glow"
              >
                {loading ? "Enviando..." : <>Enviar enlace <ChevronRight className="w-4 h-4" /></>}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver al inicio de sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
