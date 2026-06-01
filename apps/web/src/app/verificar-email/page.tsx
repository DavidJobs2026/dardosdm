"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Trophy, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

function VerifyContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const token   = params.get("token") ?? "";
  const { refreshUser } = useAuthStore();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No se encontró ningún token de verificación.");
      return;
    }

    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setStatus("success");
        setName(data.data.name ?? "");
        // Refresh user in store so emailVerified updates
        if (typeof refreshUser === "function") refreshUser().catch(() => {});
      })
      .catch(err => {
        setStatus("error");
        setMessage(err.response?.data?.message || "El enlace es inválido o ha caducado.");
      });
  }, [token]);

  const firstName = name.split(" ")[0];

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

        {status === "loading" && (
          <>
            <div className="w-16 h-16 bg-ink-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-7 h-7 text-ink-400 animate-spin" />
            </div>
            <p className="text-ink-400 text-sm">Verificando tu email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 bg-green-900/20 border-2 border-green-500/40 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-300">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">
              {firstName ? `¡Listo, ${firstName}!` : "¡Email verificado!"}
            </h1>
            <p className="text-ink-400 text-sm leading-relaxed mb-8">
              Tu cuenta está activa. Ya puedes inscribirte en torneos y seguir tus partidas.
            </p>
            <Link
              href="/torneos"
              className="btn-primary w-full py-3 text-base shadow-red-glow flex items-center justify-center gap-2"
            >
              Explorar torneos 🎯
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-20 h-20 bg-red-900/20 border-2 border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-2xl font-black text-white mb-3">Enlace inválido</h1>
            <p className="text-ink-400 text-sm leading-relaxed mb-8">
              {message}
            </p>
            <div className="space-y-3">
              <Link
                href="/auth/login"
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                Iniciar sesión
              </Link>
              <p className="text-ink-600 text-xs">
                Una vez dentro puedes reenviar el email de verificación.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerificarEmailPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
