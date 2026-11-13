"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ShieldCheck, X, Loader2, Copy, Check, AlertTriangle, KeyRound } from "lucide-react";

type Phase = "loading" | "status" | "setup" | "recovery" | "disable";

export function TwoFactorModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [phase, setPhase]     = useState<Phase>("loading");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy]       = useState(false);

  const [qr, setQr]           = useState("");
  const [secret, setSecret]   = useState("");
  const [code, setCode]       = useState("");
  const [recovery, setRecovery] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [copied, setCopied]   = useState(false);

  // Fetch current status on open
  useEffect(() => {
    api.get("/auth/me")
      .then(({ data }) => { setEnabled(!!data.data?.twoFactorEnabled); setPhase("status"); })
      .catch(() => { setPhase("status"); });
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/2fa/setup");
      setQr(data.data.qr); setSecret(data.data.secret); setCode("");
      setPhase("setup");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "No se pudo iniciar la configuración");
    } finally { setBusy(false); }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) { toast.error("Introduce el código de 6 dígitos"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/2fa/enable", { code: code.trim() });
      setRecovery(data.data.recoveryCodes ?? []);
      setEnabled(true);
      setPhase("recovery");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Código incorrecto");
    } finally { setBusy(false); }
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", { password });
      toast.success("Verificación en dos pasos desactivada");
      onChanged?.();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Contraseña incorrecta");
    } finally { setBusy(false); }
  };

  const copyRecovery = () => {
    try {
      navigator.clipboard.writeText(recovery.join("\n"));
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-800 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-400" />
            <h2 className="text-white font-bold text-base">Verificación en dos pasos</h2>
          </div>
          <button onClick={onClose} className="text-ink-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {phase === "loading" && (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-ink-500 animate-spin" /></div>
          )}

          {/* ── Status ── */}
          {phase === "status" && !enabled && (
            <div className="space-y-4">
              <p className="text-sm text-ink-300 leading-relaxed">
                Añade una capa extra de seguridad: además de tu contraseña, necesitarás un código de tu móvil para entrar.
              </p>
              <p className="text-xs text-ink-500">Compatible con Google Authenticator, Authy, 1Password o la app Contraseñas de Apple.</p>
              <button onClick={startSetup} disabled={busy}
                className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Activar
              </button>
            </div>
          )}
          {phase === "status" && enabled && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-400 font-semibold">
                <ShieldCheck className="w-4 h-4" /> Activada
              </div>
              <p className="text-sm text-ink-400">Tu cuenta pide un código al iniciar sesión.</p>
              <button onClick={() => { setPassword(""); setPhase("disable"); }}
                className="w-full py-2.5 text-sm font-semibold rounded-xl border border-red-800/50 text-red-400 bg-red-900/10 hover:bg-red-900/25 transition-all">
                Desactivar
              </button>
            </div>
          )}

          {/* ── Setup: QR + code ── */}
          {phase === "setup" && (
            <form onSubmit={confirmEnable} className="space-y-4">
              <p className="text-sm text-ink-300">1. Escanea este código QR con tu app de autenticación:</p>
              {qr && <img src={qr} alt="Código QR" className="w-44 h-44 mx-auto rounded-lg bg-white p-1.5" />}
              <div className="text-center">
                <p className="text-[11px] text-ink-500 mb-1">o introduce esta clave manualmente:</p>
                <code className="text-xs text-ink-300 bg-ink-950 border border-ink-700 rounded-lg px-2.5 py-1.5 break-all font-mono">{secret}</code>
              </div>
              <div>
                <label className="label">2. Introduce el código de 6 dígitos</label>
                <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoFocus
                  placeholder="123456" maxLength={6}
                  className="input text-center text-lg tracking-[0.3em]" />
              </div>
              <button type="submit" disabled={busy}
                className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirmar y activar
              </button>
            </form>
          )}

          {/* ── Recovery codes ── */}
          {phase === "recovery" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-700/40 bg-amber-900/10 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Guarda estos <b>códigos de recuperación</b> en un lugar seguro. Te permiten entrar si pierdes el móvil. Cada uno se usa una sola vez y no volverás a verlos.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recovery.map((c, i) => (
                  <code key={i} className="text-center text-sm text-white bg-ink-950 border border-ink-700 rounded-lg py-2 font-mono tracking-wide">{c}</code>
                ))}
              </div>
              <button onClick={copyRecovery}
                className="w-full py-2 text-xs font-semibold rounded-xl border border-ink-700 text-ink-300 hover:text-white hover:border-ink-500 transition-all flex items-center justify-center gap-2">
                {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copiados</> : <><Copy className="w-3.5 h-3.5" /> Copiar códigos</>}
              </button>
              <button onClick={() => { onChanged?.(); onClose(); }} className="btn-primary w-full py-2.5 text-sm">
                He guardado los códigos
              </button>
            </div>
          )}

          {/* ── Disable ── */}
          {phase === "disable" && (
            <form onSubmit={confirmDisable} className="space-y-4">
              <p className="text-sm text-ink-300">Confirma con tu contraseña para desactivar la verificación en dos pasos.</p>
              <div>
                <label className="label flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Contraseña</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus required className="input" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPhase("status")}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-ink-700 text-ink-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={busy || !password}
                  className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                  {busy ? "…" : "Desactivar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
