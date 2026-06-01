"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // "denied" = browser permission blocked; "granted" = allowed; null = not yet asked
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setIsSupported(false);
      return;
    }

    const perm = Notification.permission;
    setPermission(perm);

    // If browser already blocked — don't show the banner
    if (perm === "denied") {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  };

  const subscribe = async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set");
      return;
    }
    setIsLoading(true);
    try {
      // 1. Ask permission if not already granted
      const perm = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

      setPermission(perm);

      if (perm !== "granted") {
        // User denied or dismissed — hide the banner
        setIsSupported(false);
        return;
      }

      // 2. Subscribe with VAPID key
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      // 3. Save subscription to server
      await api.post("/push/subscribe", sub.toJSON());
      setIsSubscribed(true);
    } catch (e: any) {
      // Log quietly — don't let it bubble to the Next.js error overlay
      console.warn("[push] subscription failed:", e?.message ?? e);
      // If it was a permission/registration failure, hide the banner
      if (
        e?.name === "NotAllowedError" ||
        e?.name === "AbortError" ||
        String(e?.message).includes("permission") ||
        String(e?.message).includes("denied")
      ) {
        setIsSupported(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete("/push/subscribe", { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (e) {
      console.warn("[push] unsubscribe failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe };
}
