import jwt from "jsonwebtoken";

// ── Startup guard ─────────────────────────────────────────────────────────────
// If either secret is missing the server must not start — a loud failure at
// boot time is far safer than silently signing tokens with a predictable value.
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET)  throw new Error("FATAL: JWT_ACCESS_SECRET environment variable is not set");
if (!REFRESH_SECRET) throw new Error("FATAL: JWT_REFRESH_SECRET environment variable is not set");

const ACCESS_EXPIRES  = "1h";   // reduced from 4h — limits stolen-token window
const REFRESH_EXPIRES = "30d";  // extended from 7d  — survives occasional long absences

export interface JwtPayload {
  userId: string;
  role: string;
}

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, ACCESS_SECRET!, { expiresIn: ACCESS_EXPIRES });

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, REFRESH_SECRET!, { expiresIn: REFRESH_EXPIRES });

// Pin to HS256 to prevent "alg:none" and algorithm-confusion attacks
export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, ACCESS_SECRET!, { algorithms: ["HS256"] }) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, REFRESH_SECRET!, { algorithms: ["HS256"] }) as JwtPayload;

// ─── Pending 2FA token ────────────────────────────────────────────────────────
// Issued after a correct password when the account has 2FA enabled. It is NOT a
// session token: it is signed with a DIFFERENT secret so it can never pass
// verifyAccessToken (and thus cannot authenticate any request), and it is
// short-lived. It only lets the holder complete the TOTP step at /auth/2fa/login.
const PENDING_2FA_SECRET = `${ACCESS_SECRET}|2fa-pending`;

export const signPending2FAToken = (userId: string): string =>
  jwt.sign({ userId, purpose: "2fa" }, PENDING_2FA_SECRET, { expiresIn: "5m" });

export const verifyPending2FAToken = (token: string): { userId: string } => {
  const payload = jwt.verify(token, PENDING_2FA_SECRET, { algorithms: ["HS256"] }) as { userId: string; purpose?: string };
  if (payload.purpose !== "2fa") throw new Error("Invalid token purpose");
  return { userId: payload.userId };
};
