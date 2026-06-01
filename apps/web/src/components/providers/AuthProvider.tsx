"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.initAuth);

  useEffect(() => {
    // On every page load / refresh: silently exchange the httpOnly cookie for
    // a fresh access token. The token is stored only in memory — never in
    // localStorage — so it must be re-acquired after every page load.
    initAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
