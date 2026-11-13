"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/store/auth.store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  const { login, login2fa, isLoading } = useAuthStore();
  const router = useRouter();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent]           = useState(false);
  const [resendLoading, setResendLoading]     = useState(false);
  // ── 2FA step ──
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode]       = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setUnverifiedEmail(null);
    setResendSent(false);
    try {
      const res = await login(data.email, data.password);
      if (res.requires2fa && res.pendingToken) {
        setPendingToken(res.pendingToken);   // show the code step
        return;
      }
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

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingToken || twoFaCode.trim().length < 6) { toast.error("Introduce el código"); return; }
    setTwoFaLoading(true);
    try {
      await login2fa(pendingToken, twoFaCode.trim());
      toast.success("¡Bienvenido de vuelta!");
      router.push("/dashboard");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Código incorrecto";
      toast.error(msg);
      // If the pending token expired, send the user back to the password step
      if (err.response?.status === 401 && /caduc/i.test(msg)) {
        setPendingToken(null); setTwoFaCode("");
      }
    } finally {
      setTwoFaLoading(false);
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
        <Image
          src="/darts-bg.webp"
          alt=""
          aria-hidden={true}
          fill
          sizes="50vw"
          className="object-cover grayscale opacity-60"
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

          {pendingToken ? (
            <form onSubmit={handle2faSubmit} className="space-y-5">
              <h1 className="text-3xl font-black text-white mb-1">Verificación en dos pasos</h1>
              <p className="text-ink-400 mb-6">Introduce el código de 6 dígitos de tu app de autenticación.</p>
              <div>
                <label className="label">Código</label>
                <input
                  value={twoFaCode}
                  onChange={e => setTwoFaCode(e.target.value)}
                  inputMode="numeric"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={20}
                  className="input text-center text-xl tracking-[0.4em]"
                />
                <p className="text-ink-600 text-xs mt-2">¿Sin acceso a la app? Escribe uno de tus códigos de recuperación.</p>
              </div>
              <button type="submit" className="btn-primary w-full py-3 text-base mt-2 shadow-red-glow" disabled={twoFaLoading}>
                {twoFaLoading ? "Verificando..." : <>Verificar <ChevronRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={() => { setPendingToken(null); setTwoFaCode(""); }}
                className="w-full text-xs text-ink-500 hover:text-ink-300 transition-colors">
                ← Volver
              </button>
            </form>
          ) : (
          <>
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
          </>
          )}
        </div>
      </div>
    </div>
  );
}
