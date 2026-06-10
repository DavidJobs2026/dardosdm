"use client";
import { useEffect } from "react";

function playNotificationTone() {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Two-note descending ding: A5 → F#5
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
    setTimeout(() => ctx.close(), 1200);
  } catch { /* silent fail — AudioContext unavailable */ }
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(err =>
      console.error("Service worker registration failed:", err)
    );

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "push-notification") playNotificationTone();
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  return null;
}
