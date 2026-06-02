"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Trophy, ChevronRight, ChevronLeft, Eye, EyeOff, Check, Loader2, Search } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

// ─── Spanish provinces ────────────────────────────────────────────────────────
const PROVINCES = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz",
  "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón",
  "Ciudad Real", "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara",
  "Gipuzkoa", "Huelva", "Huesca", "Islas Baleares", "Jaén", "La Coruña",
  "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga",
  "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca",
  "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona",
  "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora",
  "Zaragoza", "Ceuta", "Melilla",
];

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "DNI" },
    { n: 2, label: "Datos" },
    { n: 3, label: "Consentimientos" },
  ];
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={clsx(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all",
            current === s.n
              ? "bg-red-600 text-white shadow-red-sm"
              : current > s.n
              ? "bg-green-600 text-white"
              : "bg-ink-800 text-ink-500 border border-ink-700"
          )}>
            {current > s.n ? <Check className="w-4 h-4" /> : s.n}
          </div>
          <span className={clsx(
            "text-xs font-semibold hidden sm:block",
            current === s.n ? "text-white" : current > s.n ? "text-green-400" : "text-ink-600"
          )}>{s.label}</span>
          {i < steps.length - 1 && (
            <div className={clsx("w-8 h-px mx-1", current > s.n ? "bg-green-600" : "bg-ink-800")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── DNI / NIE validator ─────────────────────────────────────────────────────
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

function validateDni(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  const DNI_RE = /^[0-9]{8}[A-Z]$/;
  const NIE_RE = /^[XYZ][0-9]{7}[A-Z]$/;

  if (DNI_RE.test(v)) {
    return v[8] === DNI_LETTERS[parseInt(v.slice(0, 8), 10) % 23];
  }
  if (NIE_RE.test(v)) {
    const prefix: Record<string, string> = { X: "0", Y: "1", Z: "2" };
    const num = parseInt(prefix[v[0]] + v.slice(1, 8), 10);
    return v[8] === DNI_LETTERS[num % 23];
  }
  return false;
}

// ─── Main registration page ───────────────────────────────────────────────────
export default function RegistroPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [step, setStep] = useState(1);

  // Step 1 — DNI
  const [dni, setDni] = useState("");
  const [dniError, setDniError] = useState("");
  const [dniResult, setDniResult] = useState<{ found: boolean; name?: string; teamName?: string; provincia?: string; cardNumber?: string } | null>(null);
  const [checkingDni, setCheckingDni] = useState(false);

  // Step 2 — Personal data
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [ligaCard, setLigaCard] = useState("");
  const [clubCard, setClubCard] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 3 — Consents
  const [gdprConsent, setGdprConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Step 1 — DNI check ─────────────────────────────────────────────────────
  const handleCheckDni = async () => {
    const trimmed = dni.trim().toUpperCase();
    if (!trimmed) return;

    if (!validateDni(trimmed)) {
      setDniError("DNI/NIE inválido — revisa el número y la letra");
      setDniResult(null);
      return;
    }
    setDniError("");
    setCheckingDni(true);
    try {
      const { data } = await api.get(`/auth/check-dni?dni=${encodeURIComponent(trimmed)}`);
      setDniResult(data.data);
      if (data.data.found && data.data.name) {
        setName(data.data.name.toUpperCase());
      }
      if (data.data.found && data.data.provincia) {
        const matched = PROVINCES.find(p => p.toLowerCase() === data.data.provincia?.toLowerCase());
        if (matched) setProvince(matched);
      }
      if (data.data.found && data.data.cardNumber) {
        setLigaCard(data.data.cardNumber);
      }
    } catch {
      setDniResult({ found: false });
    } finally {
      setCheckingDni(false);
    }
  };

  const handleStep1Continue = async () => {
    const trimmed = dni.trim().toUpperCase();
    if (!trimmed) {
      setDniError("El DNI/NIE es obligatorio");
      return;
    }
    if (!validateDni(trimmed)) {
      setDniError("DNI/NIE inválido — revisa el número y la letra");
      return;
    }
    setDniError("");
    if (!dniResult) {
      await handleCheckDni();
    }
    setStep(2);
  };

  const handlePhoneBlur = async () => {
    const trimmed = phone.trim().replace(/\s/g, "");
    if (!trimmed || !/^[67]\d{8}$/.test(trimmed)) return;
    try {
      const { data } = await api.get(`/auth/check-phone?phone=${encodeURIComponent(trimmed)}`);
      setPhoneError(data.data.inUse ? "Este teléfono ya está asociado a otra cuenta." : "");
    } catch {
      // silent
    }
  };

  const handleEmailBlur = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    try {
      const { data } = await api.get(`/auth/check-email?email=${encodeURIComponent(trimmed)}`);
      if (data.data.inUse) {
        setEmailError("Este email ya tiene una cuenta. ¿Quieres iniciar sesión?");
      } else {
        setEmailError("");
      }
    } catch {
      // silent — server will validate on submit
    }
  };

  // ─── Step 2 — Personal data validation ──────────────────────────────────────
  const handleStep2Continue = () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Introduce un email válido");
      return;
    }
    if (emailError) {
      toast.error("Corrige el email antes de continuar");
      return;
    }
    if (phoneError) {
      toast.error("Corrige el teléfono antes de continuar");
      return;
    }
    if (phone && !/^[67]\d{8}$/.test(phone.replace(/\s/g, ""))) {
      toast.error("El teléfono debe tener 9 dígitos y comenzar por 6 o 7");
      return;
    }
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setStep(3);
  };

  // ─── Step 3 — Final submission ───────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!gdprConsent) {
      toast.error("Debes aceptar la Política de Privacidad para continuar");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, name, "player", {
        dni: dni.trim().toUpperCase() || undefined,
        phone: phone.trim() || undefined,
        province: province || undefined,
        birthDate: birthDate || undefined,
        ligaCard: ligaCard.trim() || undefined,
        clubCard: clubCard.trim() || undefined,
        gdprConsent,
        whatsappConsent,
        emailConsent,
      });
      toast.success("¡Cuenta creada! Revisa tu email para verificarla.");
      router.push(`/verificar-email/pendiente?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al crear la cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full px-3.5 py-2.5 bg-ink-900 border border-ink-700 rounded-xl text-white placeholder-ink-500 " +
    "focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/20 transition-all text-sm";

  return (
    <div className="min-h-screen bg-ink-950 flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-ink-900 border-r border-ink-800 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-red-900/30 via-transparent to-transparent" />
        <div className="relative text-center px-12">
          <div className="w-20 h-20 bg-red-gradient rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-red-glow">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight">
            Dardos<span className="text-red-500">DM</span>
          </h2>
          <p className="text-ink-400 text-lg leading-relaxed">
            Regístrate como jugador y participa en torneos de dardos.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-12">
            {[["🎯", "Torneos"], ["📊", "Rankings"], ["🏆", "Brackets"]].map(([v, l]) => (
              <div key={l} className="bg-ink-800/60 border border-ink-700 rounded-xl p-4">
                <p className="text-2xl font-black text-red-400">{v}</p>
                <p className="text-xs text-ink-500 mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-red-gradient rounded-xl flex items-center justify-center shadow-red-sm">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Dardos<span className="text-red-500">DM</span></span>
          </div>

          <h1 className="text-3xl font-black text-white mb-1 tracking-tight">Crear cuenta de jugador</h1>
          <p className="text-ink-400 text-sm mb-6">Regístrate para inscribirte en torneos</p>

          <StepIndicator current={step} />

          {/* ─── STEP 1 — DNI ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                  DNI / NIE
                </label>
                <div className="relative flex gap-2">
                  <input
                    value={dni}
                    onChange={e => {
                      setDni(e.target.value.toUpperCase());
                      setDniResult(null);
                      setDniError("");
                    }}
                    onBlur={handleCheckDni}
                    className={clsx(inputCls, "flex-1", dniError && "border-red-500/70")}
                    placeholder="12345678A"
                    maxLength={12}
                  />
                  <button
                    type="button"
                    onClick={handleCheckDni}
                    disabled={checkingDni || !dni.trim()}
                    className="px-3.5 py-2.5 bg-ink-800 border border-ink-700 rounded-xl text-ink-400 hover:text-white hover:border-ink-500 transition-all disabled:opacity-40"
                  >
                    {checkingDni ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* DNI validation error */}
              {dniError && (
                <p className="text-red-400 text-xs flex items-center gap-1.5 -mt-1">
                  <span>⚠</span> {dniError}
                </p>
              )}

              {/* DNI result */}
              {!dniError && dniResult && (
                dniResult.found ? (
                  <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-700/50 rounded-xl">
                    <Check className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-green-300 font-semibold text-sm">¡Te hemos encontrado!</p>
                      <p className="text-green-400/80 text-xs mt-0.5">
                        Nombre: <strong>{dniResult.name}</strong>
                        {dniResult.teamName && <> · Club: <strong>{dniResult.teamName}</strong></>}
                        {dniResult.provincia && <> · Provincia: <strong>{dniResult.provincia}</strong></>}
                      </p>
                      <p className="text-ink-500 text-xs mt-1">Tus datos se han rellenado automáticamente.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4 bg-ink-800/60 border border-ink-700 rounded-xl">
                    <div className="w-5 h-5 rounded-full bg-ink-700 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-ink-400 text-xs font-bold">i</span>
                    </div>
                    <div>
                      <p className="text-ink-300 font-semibold text-sm">DNI no encontrado en el historial</p>
                      <p className="text-ink-500 text-xs mt-0.5">No estás en el historial, pero puedes registrarte igualmente</p>
                    </div>
                  </div>
                )
              )}

              <p className="text-ink-600 text-xs">
                Usamos tu DNI para verificar tu identidad y conectar tu cuenta con tu historial de partidas.
              </p>

              <button
                onClick={handleStep1Continue}
                disabled={checkingDni}
                className="btn-primary w-full py-3 text-base shadow-red-glow flex items-center justify-center gap-2"
              >
                {checkingDni ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continuar <ChevronRight className="w-4 h-4" /></>}
              </button>

              <div className="text-center pt-2">
                <p className="text-ink-600 text-xs">
                  ¿Ya tienes cuenta?{" "}
                  <Link href="/auth/login" className="text-red-400 hover:text-red-300 transition-colors font-semibold">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* ─── STEP 2 — Personal data ───────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">Nombre completo</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value.toUpperCase())}
                  className={inputCls}
                  placeholder="JUAN GARCÍA LÓPEZ"
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError(""); }}
                  onBlur={handleEmailBlur}
                  type="email"
                  className={clsx(inputCls, emailError && "border-red-500/70")}
                  placeholder="tu@email.com"
                />
                {emailError && (
                  <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1.5">
                    <span>⚠</span>
                    {emailError}{" "}
                    <Link href="/auth/login" className="underline hover:text-red-300 transition-colors">
                      Iniciar sesión
                    </Link>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                  Teléfono móvil <span className="text-ink-600 font-normal normal-case">(WhatsApp · opcional)</span>
                </label>
                <input
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setPhoneError(""); }}
                  onBlur={handlePhoneBlur}
                  type="tel"
                  className={clsx(inputCls, phoneError && "border-red-500/70")}
                  placeholder="612345678"
                  maxLength={9}
                />
                {phoneError
                  ? <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1.5"><span>⚠</span> {phoneError}</p>
                  : <p className="text-ink-600 text-xs mt-1">9 dígitos, comenzando por 6 o 7</p>
                }
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">Provincia</label>
                <select
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className={clsx(inputCls, "cursor-pointer")}
                >
                  <option value="">Selecciona tu provincia</option>
                  {PROVINCES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                  Fecha de nacimiento <span className="text-ink-600 font-normal normal-case">(opcional)</span>
                </label>
                <input
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  type="date"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                    Tarjeta liga Phoenix <span className="text-ink-600 font-normal normal-case">(opcional)</span>
                  </label>
                  <input
                    value={ligaCard}
                    onChange={e => setLigaCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                    className={clsx(inputCls, "font-mono tracking-wider")}
                    placeholder="16 dígitos"
                    maxLength={16}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">
                    Tarjeta club Phoenix <span className="text-ink-600 font-normal normal-case">(opcional)</span>
                  </label>
                  <input
                    value={clubCard}
                    onChange={e => setClubCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                    className={clsx(inputCls, "font-mono tracking-wider")}
                    placeholder="16 dígitos"
                    maxLength={16}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
                <div className="relative">
                  <input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    className={clsx(inputCls, "pr-10")}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-400 mb-1.5 uppercase tracking-wider">Confirmar contraseña</label>
                <div className="relative">
                  <input
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    type={showConfirm ? "text" : "password"}
                    className={clsx(inputCls, "pr-10", confirmPassword && password !== confirmPassword ? "border-red-500/60" : "")}
                    placeholder="Repite la contraseña"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-white transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Las contraseñas no coinciden</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white hover:border-ink-500 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={handleStep2Continue}
                  className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2"
                >
                  Continuar <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3 — Consents ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-4">
                {/* GDPR — required */}
                <label className={clsx(
                  "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                  gdprConsent
                    ? "border-red-500/50 bg-red-900/10"
                    : "border-ink-700 bg-ink-900/50 hover:border-ink-600"
                )}>
                  <div className={clsx(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                    gdprConsent ? "bg-red-600 border-red-600" : "border-ink-600 bg-transparent"
                  )}>
                    {gdprConsent && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={gdprConsent}
                    onChange={e => setGdprConsent(e.target.checked)}
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      Política de privacidad{" "}
                      <span className="text-red-400 text-xs font-bold ml-1">OBLIGATORIO</span>
                    </p>
                    <p className="text-ink-400 text-xs mt-1 leading-relaxed">
                      He leído y acepto la{" "}
                      <Link href="/privacidad" className="text-red-400 hover:text-red-300 underline" target="_blank">
                        Política de Privacidad
                      </Link>{" "}
                      y el tratamiento de mis datos personales para la gestión de torneos de dardos.
                    </p>
                  </div>
                </label>

                {/* WhatsApp consent — optional */}
                <label className={clsx(
                  "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                  whatsappConsent
                    ? "border-green-500/40 bg-green-900/10"
                    : "border-ink-700 bg-ink-900/50 hover:border-ink-600"
                )}>
                  <div className={clsx(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                    whatsappConsent ? "bg-green-600 border-green-600" : "border-ink-600 bg-transparent"
                  )}>
                    {whatsappConsent && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={whatsappConsent}
                    onChange={e => setWhatsappConsent(e.target.checked)}
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      Notificaciones por WhatsApp{" "}
                      <span className="text-ink-500 text-xs font-normal ml-1">opcional</span>
                    </p>
                    <p className="text-ink-400 text-xs mt-1 leading-relaxed">
                      Acepto recibir comunicaciones y avisos de partidas vía WhatsApp al número proporcionado.
                    </p>
                  </div>
                </label>

                {/* Email consent — optional */}
                <label className={clsx(
                  "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                  emailConsent
                    ? "border-blue-500/40 bg-blue-900/10"
                    : "border-ink-700 bg-ink-900/50 hover:border-ink-600"
                )}>
                  <div className={clsx(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                    emailConsent ? "bg-blue-600 border-blue-600" : "border-ink-600 bg-transparent"
                  )}>
                    {emailConsent && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={emailConsent}
                    onChange={e => setEmailConsent(e.target.checked)}
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      Comunicaciones por email{" "}
                      <span className="text-ink-500 text-xs font-normal ml-1">opcional</span>
                    </p>
                    <p className="text-ink-400 text-xs mt-1 leading-relaxed">
                      Acepto recibir comunicaciones e información de torneos vía email.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-ink-700 text-ink-300 text-sm font-semibold hover:text-white hover:border-ink-500 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !gdprConsent}
                  className="btn-primary flex-1 py-2.5 shadow-red-glow flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta…</>
                    : <><Check className="w-4 h-4" /> Crear mi cuenta</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
