import axios from "axios";
import { getAccessToken, setAccessToken } from "./token";

// Same-origin relative base: the browser hits /api/v1 on THIS origin and Next.js
// rewrites (see next.config.ts) proxy it to the backend. Keeping it same-origin
// makes the httpOnly refresh cookie first-party so the session survives reloads
// even where third-party cookies are blocked (Safari, Chrome). WebSockets still
// use NEXT_PUBLIC_WS_URL directly (they auth with the access token, not the cookie).
const API_URL = "/api/v1";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  // Required so the browser sends the httpOnly refreshToken cookie on cross-origin requests
  withCredentials: true,
});

// Inject access token on every request — read from in-memory holder, never from localStorage
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Shared refresh promise ──────────────────────────────────────────────────
// All concurrent 401s share the same refresh call instead of each trying to
// rotate the token independently (which would cause the second one to fail
// with "token not found" and incorrectly log the user out).
let _refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = axios
    .post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
    .then(({ data }) => {
      const token = data.data.tokens.accessToken as string;
      setAccessToken(token);
      return token;
    })
    .finally(() => {
      _refreshPromise = null;
    });

  return _refreshPromise;
}

// Auto-refresh on 401 — the refreshToken travels in an httpOnly cookie automatically
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Never try to auto-refresh if the failing request IS the refresh endpoint —
    // that would create an infinite loop (refresh fails → retry refresh → fails → …)
    // Also skip if we already retried once.
    const isRefreshRequest = original?.url?.includes("/auth/refresh");
    if (error.response?.status === 401 && !original._retry && !isRefreshRequest) {
      original._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);
