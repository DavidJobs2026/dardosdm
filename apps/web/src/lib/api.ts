import axios from "axios";
import { getAccessToken, setAccessToken } from "./token";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

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

// Auto-refresh on 401 — the refreshToken travels in an httpOnly cookie automatically
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        // No need to send the refresh token manually — it arrives via cookie
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const { accessToken } = data.data.tokens;
        setAccessToken(accessToken);                          // store only in memory
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
