"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { Trophy, Mail, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

function PendingContent() {
  // Email is passed as a query param from the registration page (?email=...).
  // We use the PUBLIC /auth/request-verification endpoint so no login is required.
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    if (!email) {
      toast.error("No se encontró tu dirección de email. Inténtalo desde el registro.");
      return;
    }
    setResending(true);
    try {
      // Public endpoint — only needs the email address, no auth token required
      await api.post("/auth/request-verification", { email });
      setSent(true);
      toast.success("Email reenviado. Revisa tu bandeja de entrada.");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al reenviar");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-12">
          <div className="w-10 h-10 bg-red-gradient rounded-xl flex items-center justify-center shadow-red-sm">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">
            Dardos<span className="text-red-500">DM</span>
          </span>
        </div>

        {/* Icon */}
        <div className="w-20 h-20 bg-blue-900/20 border-2 border-blue-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-9 h-9 text-blue-400" />
        </div>

        <h1 className="text-2xl font-black text-white mb-3">Revisa tu email</h1>
        <p className="text-ink-400 text-sm leading-relaxed mb-6">
          Te hemos enviado un enlace de verificación a tu dirección de email.
          Haz clic en el botón del email para activar tu cuenta.
        </p>

        <p className="text-ink-500 text-xs leading-relaxed mb-8">
          Haz clic en el botón del email para activar tu cuenta.
          El enlace caduca en <span className="text-ink-300">24 horas</span>.
          Revisa también la carpeta de spam.
        </p>

        {/* Resend */}
        <button
          onClick={handleResend}
          disabled={resending || sent}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white hover:border-ink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {resending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Reenviando…</>
            : sent
            ? "✓ Email reenviado"
            : <><RefreshCw className="w-4 h-4" /> Reenviar email de verificación</>
          }
        </button>

        <Link
          href="/torneos"
          className="flex items-center justify-center gap-2 text-ink-500 hover:text-ink-300 text-sm transition-colors"
        >
          Continuar sin verificar por ahora <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        <p className="text-ink-700 text-xs mt-10">
          ¿Tienes cuenta?{" "}
          <Link href="/auth/login" className="text-red-400 hover:text-red-300 transition-colors">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerificarEmailPendientePage() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  );
}
