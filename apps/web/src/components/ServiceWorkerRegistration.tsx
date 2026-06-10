"use client";
import { useEffect } from "react";

// iOS Safari suspends AudioContext until a user gesture unlocks it.
// We create and resume the context on first touch/click, then reuse it.
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!_ctx) _ctx = new AudioCtx();
  return _ctx;
}

function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  // iOS requires playing a silent buffer to fully unlock
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

function playNotificationTone() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") { ctx.resume(); return; } // not yet unlocked, skip

    const notes: { freq: number; start: number; dur: number }[] = [
      { freq: 880, start: 0,    dur: 0.28 },
      { freq: 740, start: 0.22, dur: 0.38 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    });
  } catch { /* AudioContext unavailable */ }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(err =>
      console.error("Service worker registration failed:", err)
    );

    // Unlock AudioContext on first user interaction (required by iOS Safari)
    document.addEventListener("touchstart", unlockAudio, { passive: true });
    document.addEventListener("click",      unlockAudio, { passive: true });

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "push-notification") playNotificationTone();
    };
    navigator.serviceWorker.addEventListener("message", handler);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click",      unlockAudio);
    };
  }, []);

  return null;
}
