import jwt from "jsonwebtoken";

// ── Startup guard ─────────────────────────────────────────────────────────────
// If either secret is missing the server must not start — a loud failure at
// boot time is far safer than silently signing tokens with a predictable value.
const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET)  throw new Error("FATAL: JWT_ACCESS_SECRET environment variable is not set");
if (!REFRESH_SECRET) throw new Error("FATAL: JWT_REFRESH_SECRET environment variable is not set");

const ACCESS_EXPIRES  = "15m";
const REFRESH_EXPIRES = "7d";

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
