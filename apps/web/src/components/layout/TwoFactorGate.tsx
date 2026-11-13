"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/auth.store";
import { TwoFactorModal } from "./TwoFactorModal";
import { ShieldAlert, ShieldCheck } from "lucide-react";

const DISMISS_KEY = "2fa-gate-dismissed";

/**
 * Enforces two-factor authentication for admins and organizers. When one of them
 * logs in without 2FA, a blocking prompt appears with a button to set it up.
 * A per-session "later" escape avoids locking anyone out mid-tournament; the
 * prompt returns on the next login until 2FA is actually enabled.
 */
export function TwoFactorGate() {
  const user        = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [setupOpen, setSetupOpen]       = useState(false);
  const [dismissed, setDismissed]       = useState(false);
  const [enabledNow, setEnabledNow]     = useState(false);
  const [mounted, setMounted]           = useState(false);

  useEffect(() => {
    setMounted(true);
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  if (!mounted || !user) return null;

  // While the setup modal is open, always keep it rendered — even after 2FA is
  // enabled — so the user can read and save their recovery codes before it closes.
  if (setupOpen) {
    return (
      <TwoFactorModal
        autoStart
        onClose={() => setSetupOpen(false)}
        onChanged={() => { setEnabledNow(true); refreshUser(); }}
      />
    );
  }

  const mustEnforce = (user.role === "admin" || user.role === "organizer") && !user.twoFactorEnabled && !enabledNow;
  if (!mustEnforce || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-ink-900 border border-red-900/50 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-gradient mx-auto mb-4 grid place-items-center shadow-red-glow">
            <ShieldAlert className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-white font-black text-xl mb-2">Protege tu cuenta</h2>
          <p className="text-ink-300 text-sm leading-relaxed">
            Como organizador gestionas datos de jugadores. Para proteger la cuenta es obligatorio activar la{" "}
            <b className="text-white">verificación en dos pasos</b>: además de tu contraseña, al entrar pedirá un código de tu móvil.
          </p>
        </div>
        <div className="px-6 pb-6 space-y-2.5">
          <button onClick={() => setSetupOpen(true)}
            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2 shadow-red-glow">
            <ShieldCheck className="w-5 h-5" /> Activar ahora
          </button>
          <button onClick={dismiss}
            className="w-full py-2 text-xs text-ink-600 hover:text-ink-400 transition-colors">
            Ahora no — recordármelo la próxima vez
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
