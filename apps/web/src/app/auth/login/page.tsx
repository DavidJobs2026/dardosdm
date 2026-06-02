"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Trophy, Mail, Lock, ChevronRight, MailCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";

const schema = z.object({
  email:    z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, isLoading } = useAuthStore();
  const router = useRouter();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent]           = useState(false);
  const [resendLoading, setResendLoading]     = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setUnverifiedEmail(null);
    setResendSent(false);
    try {
      await login(data.email, data.password);
      toast.success("¡Bienvenido de vuelta!");
      router.push("/dashboard");
    } catch (err: any) {
      if (err.response?.data?.error === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(data.email);
      } else {
        toast.error(err.response?.data?.message || "Credenciales incorrectas");
      }
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail || resendLoading) return;
    setResendLoading(true);
    try {
      await api.post("/auth/request-verification", { email: unverifiedEmail });
      setResendSent(true);
    } catch {
      toast.error("No se pudo reenviar el email. Inténtalo de nuevo.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex">
      {/* Left panel — decorativo */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-ink-900 border-r border-ink-800
                      items-center justify-center overflow-hidden">
        {/* Background image — grayscale */}
        <img
          src="/darts-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover grayscale opacity-60"
        />
        {/* Dark overlay so text stays readable */}
        <div className="absolute inset-0 bg-ink-950/40" />
        <div className="absolute inset-0 bg-gradient-radial from-red-900/20 via-transparent to-transparent" />
        <div className="relative text-center px-12">
          <div className="w-20 h-20 bg-red-gradient rounded-2xl flex items-center justify-center
                          mx-auto mb-8 shadow-red-glow">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight">
            Dardos<span className="text-red-500">DM</span>
          </h2>
          <p className="text-ink-400 text-lg leading-relaxed">
            Consulta nuestros torneos<br />y apúntate.
          </p>

          {/* stats decorativas */}
          <div className="grid grid-cols-2 gap-4 mt-12">
            {[["∞", "Torneos"], ["+", "Inscripciones"]].map(([v, l]) => (
              <div key={l} className="bg-ink-800/60 border border-ink-700 rounded-xl p-4">
                <p className="text-2xl font-black text-red-400">{v}</p>
                <p className="text-xs text-ink-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 bg-red-gradient rounded-xl flex items-center justify-center shadow-red-sm">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Dardos<span className="text-red-500">DM</span></span>
          </div>

          <h1 className="text-3xl font-black text-white mb-1">Iniciar sesión</h1>
          <p className="text-ink-400 mb-8">Accede a tu cuenta de torneos</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input {...register("email")} type="email" className="input pl-10"
                  placeholder="tu@email.com" />
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1.5">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
                <input {...register("password")} type="password" className="input pl-10"
                  placeholder="••••••••" />
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1.5">{errors.password.message}</p>}
            </div>

            {/* Email not verified banner */}
            {unverifiedEmail && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <MailCheck className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-300 font-semibold mb-1">Email sin verificar</p>
                    <p className="text-amber-200/80 text-xs leading-relaxed">
                      Debes verificar tu email antes de iniciar sesión.
                      Revisa tu bandeja de entrada (y la carpeta de spam).
                    </p>
                    {resendSent ? (
                      <p className="text-green-400 text-xs mt-2 font-medium">
                        ✓ Email reenviado — revisa tu bandeja de entrada
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendLoading}
                        className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors disabled:opacity-50"
                      >
                        {resendLoading ? "Enviando..." : "Reenviar email de verificación"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end -mt-1">
              <Link href="/auth/forgot-password" className="text-xs text-ink-500 hover:text-red-400 transition-colors">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button type="submit" className="btn-primary w-full py-3 text-base mt-2 shadow-red-glow"
              disabled={isLoading}>
              {isLoading ? "Entrando..." : <>Iniciar sesión <ChevronRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-ink-800 text-center">
            <p className="text-ink-600 text-xs">Acceso restringido · Contacta con el administrador</p>
          </div>

          <div className="mt-4 pt-4 border-t border-ink-800 text-center">
            <p className="text-ink-500 text-sm">¿Eres jugador?{" "}
              <Link href="/registro" className="text-red-400 hover:text-red-300 font-semibold transition-colors">
                Crear cuenta de jugador
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
