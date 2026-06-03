import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User } from "@tournament/types";
import { api } from "@/lib/api";
import { getAccessToken, setAccessToken } from "@/lib/token";

interface PlayerExtra {
  dni?: string;
  phone?: string;
  province?: string;
  birthDate?: string;
  ligaCard?: string;
  clubCard?: string;
  gdprConsent?: boolean;
  whatsappConsent?: boolean;
  emailConsent?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;   // in-memory only — NOT persisted to localStorage
  isLoading: boolean;

  login:       (email: string, password: string) => Promise<void>;
  register:    (email: string, password: string, name: string, role: "organizer" | "player", extra?: PlayerExtra) => Promise<void>;
  logout:      () => Promise<void>;
  logoutAll:   () => Promise<void>;
  fetchMe:     () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Call once on app mount. Silently exchanges the httpOnly cookie for a new access token. */
  initAuth:    () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post("/auth/login", { email, password });
          const { user, tokens } = data.data;
          // Token lives only in memory — never written to any storage
          setAccessToken(tokens.accessToken);
          set({ user, accessToken: tokens.accessToken });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email, password, name, role, extra?) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post("/auth/register", { email, password, name, role, ...extra });
          const { user, tokens, requiresEmailVerification } = data.data;

          if (requiresEmailVerification) {
            // Player registered — no tokens issued until email is verified.
            // Caller (registro/page.tsx) handles the redirect to /verificar-email/pendiente.
            set({ user: null, accessToken: null });
          } else {
            // Organizer / admin — pre-verified, tokens issued immediately.
            setAccessToken(tokens.accessToken);
            set({ user, accessToken: tokens.accessToken });
          }
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        // POST to /auth/logout — cookie is sent automatically, server deletes it
        await api.post("/auth/logout", {}).catch(() => {});
        setAccessToken(null);
        set({ user: null, accessToken: null });
      },

      logoutAll: async () => {
        // Revokes ALL refresh tokens for this user across every device
        await api.post("/auth/logout-all", {}).catch(() => {});
        setAccessToken(null);
        set({ user: null, accessToken: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get("/auth/me");
          set({ user: data.data });
        } catch {
          setAccessToken(null);
          set({ user: null, accessToken: null });
        }
      },

      refreshUser: async () => {
        try {
          const { data } = await api.get("/auth/me");
          set({ user: data.data });
        } catch { /* silent */ }
      },

      initAuth: async () => {
        // Called once on app mount. Silently exchanges the httpOnly refresh
        // cookie for a fresh access token. Two separate try/catch blocks so
        // a transient /auth/me error never logs the user out when the refresh
        // itself succeeded.

        // Fast path: in-memory token still alive (same-tab re-render)
        const existing = getAccessToken();
        if (existing) {
          try {
            const me = await api.get("/auth/me");
            set({ user: me.data.data });
            return;
          } catch { /* token expired — fall through to refresh */ }
        }

        // ── Step 1: exchange cookie for a new access token ──────────────────
        let accessToken: string;
        try {
          const { data } = await api.post("/auth/refresh", {});
          accessToken = data.data.tokens.accessToken;
          setAccessToken(accessToken);
          set({ accessToken });
        } catch {
          // No valid cookie → not logged in
          setAccessToken(null);
          set({ user: null, accessToken: null });
          return;
        }

        // ── Step 2: fetch user data (best-effort, don't log out on failure) ──
        try {
          const me = await api.get("/auth/me");
          set({ user: me.data.data });
        } catch {
          // Keep the token alive; UI will retry on next interaction
        }
      },
    }),
    {
      name: "auth-store",
      // Only persist the user object (non-sensitive display data) — never the token
      partialize: (s) => ({ user: s.user }),
    }
  )
);
