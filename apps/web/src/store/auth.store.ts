import { create } from "zustand";
import { persist } from "zustand/middleware";
import { User } from "@tournament/types";
import { api } from "@/lib/api";
import { setAccessToken } from "@/lib/token";

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
        // Called once on app mount. If we have a user in persisted state but no
        // in-memory token (e.g. after a page refresh), silently call /refresh.
        // The httpOnly cookie is sent automatically — no token needed in the request.
        try {
          const { data } = await api.post("/auth/refresh", {});
          const { accessToken } = data.data.tokens;
          setAccessToken(accessToken);
          set({ accessToken });
          // Fetch fresh user data after token renewal
          const me = await api.get("/auth/me");
          set({ user: me.data.data });
        } catch {
          // No valid cookie → user is not logged in
          setAccessToken(null);
          set({ user: null, accessToken: null });
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
