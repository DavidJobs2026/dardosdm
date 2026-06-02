"use client";

import { useEffect, useState } from "react";
import { Bell, Smartphone } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ── Snooze helpers ─────────────────────────────────────────────────────────────
// "Ahora no" hides the modal for 24 h.  On next login it reappears until the
// user either activates or their browser blocks notifications.
const SNOOZE_KEY = "notif-prompt-snoozed-until";

function isSnoozed(): boolean {
  if (typeof window === "undefined") return false;
  const val = localStorage.getItem(SNOOZE_KEY);
  return !!val && Date.now() < Number(val);
}

function snooze24h() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
}

// ── Component ──────────────────────────────────────────────────────────────────
type Step = "prompt" | "ios" | "activating" | "done";

export function NotificationPromptModal() {
  const user = useAuthStore((s) => s.user);
  const { isSupported, isSubscribed, needsInstall, subscribe } = usePushNotifications();

  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState<Step>("prompt");

  // Decide whether to show ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user)           { setVisible(false); return; }
    if (isSubscribed)    { setVisible(false); return; }
    if (isSnoozed())     { setVisible(false); return; }

    if (needsInstall) {
      // iOS browser — can't subscribe without PWA install
      setStep("ios");
      setVisible(true);
      return;
    }

    if (isSupported && !isSubscribed) {
      // Android / desktop — can subscribe directly
      setStep("prompt");
      setVisible(true);
    }
  }, [user, isSupported, isSubscribed, needsInstall]);

  // Actions ────────────────────────────────────────────────────────────────────
  const handleActivate = async () => {
    setStep("activating");
    await subscribe();
    setStep("done");
    // Auto-close after brief success state
    setTimeout(() => setVisible(false), 1800);
  };

  const handleSnooze = () => {
    snooze24h();
    setVisible(false);
  };

  if (!visible) return null;

  // ── iOS: show install instructions ──────────────────────────────────────────
  if (step === "ios") {
    return (
      <Backdrop>
        <div className="w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">
          <Header icon={<Smartphone className="w-5 h-5 text-white" />} title="Instala DardosDM" subtitle="Para recibir notificaciones" />
          <div className="px-6 py-5 space-y-4">
            <p className="text-ink-300 text-sm leading-relaxed">
              Para recibir avisos de partidos y novedades al instante, primero añade la app a tu pantalla de inicio:
            </p>
            <InfoCard>
              <p className="text-white text-sm font-semibold mb-1">📱 iPhone (Safari)</p>
              <p className="text-ink-400 text-xs leading-relaxed">
                Pulsa el botón <strong className="text-ink-200">Compartir</strong> (cuadrado con flecha hacia arriba) y
                selecciona <strong className="text-ink-200">"Añadir a pantalla de inicio"</strong>.
                Luego abre DardosDM desde el icono y activa las notificaciones.
              </p>
            </InfoCard>
            <p className="text-ink-500 text-xs text-center">
              Una vez instalada, vuelve a iniciar sesión y activa las notificaciones.
            </p>
          </div>
          <ActionRow
            onSnooze={handleSnooze}
            snoozeLabel="Ahora no"
            confirmLabel="Entendido"
            onConfirm={handleSnooze}
          />
        </div>
      </Backdrop>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <Backdrop>
        <div className="w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-900/40 border border-green-700/60 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-7 h-7 text-green-400" />
          </div>
          <h2 className="text-white font-bold text-lg">¡Notificaciones activadas!</h2>
          <p className="text-ink-400 text-sm mt-2">
            Recibirás avisos de partidos, llamadas al cuadro y novedades al instante.
          </p>
        </div>
      </Backdrop>
    );
  }

  // ── Main prompt (Android / desktop) ─────────────────────────────────────────
  const isActivating = step === "activating";
  return (
    <Backdrop>
      <div className="w-full max-w-md bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">
        <Header icon={<Bell className="w-5 h-5 text-white" />} title="Activa las notificaciones" subtitle="Para no perderte nada" />

        <div className="px-6 py-5 space-y-3">
          <p className="text-ink-300 text-sm leading-relaxed">
            Recibe avisos directamente en tu dispositivo:
          </p>

          {/* Benefit list */}
          <div className="space-y-2">
            {BENEFITS.map(({ emoji, text }) => (
              <div key={text} className="flex items-center gap-3 bg-ink-800 rounded-lg px-3 py-2.5">
                <span className="text-base leading-none">{emoji}</span>
                <span className="text-ink-300 text-sm">{text}</span>
              </div>
            ))}
          </div>

          {/* Android install hint */}
          <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-3.5">
            <p className="text-blue-300 text-xs leading-relaxed">
              <span className="font-semibold">📱 Android (Chrome):</span>{" "}
              Para una mejor experiencia, añade DardosDM a tu pantalla de inicio
              desde el menú de Chrome (⋮ → Añadir a pantalla de inicio).
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleSnooze}
            disabled={isActivating}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-ink-400 bg-ink-800
                       hover:bg-ink-700 transition-colors disabled:opacity-40">
            Ahora no
          </button>
          <button
            onClick={handleActivate}
            disabled={isActivating}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600
                       hover:bg-red-500 transition-colors flex items-center justify-center gap-2
                       disabled:opacity-60">
            {isActivating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Activando…
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                Activar notificaciones
              </>
            )}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4
                    bg-black/70 backdrop-blur-sm">
      {children}
    </div>
  );
}

function Header({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="bg-gradient-to-r from-red-950 to-red-900 px-6 pt-6 pb-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">{title}</h2>
          <p className="text-red-200/80 text-xs mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
      {children}
    </div>
  );
}

function ActionRow({
  onSnooze,
  snoozeLabel,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  onSnooze: () => void;
  snoozeLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="px-6 pb-6 flex gap-3">
      <button
        onClick={onSnooze}
        disabled={disabled}
        className="flex-1 py-3 rounded-xl text-sm font-medium text-ink-400 bg-ink-800
                   hover:bg-ink-700 transition-colors disabled:opacity-40">
        {snoozeLabel}
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600
                   hover:bg-red-500 transition-colors disabled:opacity-60">
        {confirmLabel}
      </button>
    </div>
  );
}

const BENEFITS = [
  { emoji: "🎯", text: "Llamadas a cuadro e inicio de partidos" },
  { emoji: "📢", text: "Novedades y cambios del torneo" },
  { emoji: "🏆", text: "Resultados y clasificaciones" },
];
