import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "path";
import { createRouter } from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import { initSocket } from "./lib/socket";

const app = express();
const httpServer = http.createServer(app);

// Railway does NOT strip client-supplied X-Forwarded-For headers, so pure
// IP-based rate limiting can be bypassed by rotating XFF values.
// Mitigation: trust only RFC-1918 upstream hops (Railway's internal proxy)
// AND add email-based rate limiting to the most sensitive endpoints so
// the key cannot be spoofed regardless of IP tricks.
app.set("trust proxy", (ip: string) =>
  ip === "127.0.0.1" ||
  ip.startsWith("10.") ||
  /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
  ip.startsWith("192.168.")
);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
// Skip logging for routes that carry sensitive data in URL params or query strings
// (tokens, DNI numbers, phone numbers, email addresses)
app.use(morgan("dev", {
  skip: (req) =>
    req.path.includes("verify-email") ||
    req.path.includes("reset-password") ||
    req.path.includes("check-dni") ||
    req.path.includes("check-phone") ||
    req.path.includes("check-email"),
}));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
// ── Rate limiters ─────────────────────────────────────────────────────────────
// IP-based (primary layer — can be partially bypassed via XFF on Railway)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Demasiados intentos, espera un momento",
  standardHeaders: true,
  legacyHeaders: false,
});
const enumerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Demasiadas consultas, espera un momento",
  standardHeaders: true,
  legacyHeaders: false,
});
const emailSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: "Demasiados intentos de reenvío, espera 15 minutos",
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: "Too many requests",
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Email-based rate limiters (cannot be bypassed by spoofing IP) ─────────────
// Login: 10 attempts per email per hour — stops targeted brute-force regardless of IP tricks
const loginEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? "").toLowerCase().trim();
    return email ? `login:email:${email}` : `login:ip:${req.ip}`;
  },
  message: "Demasiados intentos para este email, espera 1 hora",
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
});
// Forgot-password: 3 reset requests per email per hour
const forgotEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => {
    const email = (req.body?.email ?? "").toLowerCase().trim();
    return email ? `forgot:email:${email}` : `forgot:ip:${req.ip}`;
  },
  message: "Demasiadas solicitudes de reset para este email, espera 1 hora",
  standardHeaders: true,
  legacyHeaders: false,
});
// Refresh: 60 token exchanges per 15 min per IP — prevents token brute-force
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Demasiadas peticiones de refresco de sesión",
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Static uploads ───────────────────────────────────────────────────────────
// Allow cross-origin image loading (frontend on :3000 loads images from :4000)
app.use("/uploads", (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(process.env.UPLOADS_PATH || path.join(__dirname, "../../uploads")));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1/auth/check-email",           enumerationLimiter);                  // 20/15min — bulk enumeration
app.use("/api/v1/auth/check-phone",           enumerationLimiter);
app.use("/api/v1/auth/check-dni",             enumerationLimiter);                  // 20/15min — DNI enumeration
app.use("/api/v1/auth/request-verification",  emailSendLimiter);                    // 3/15min  — email spam
app.use("/api/v1/auth/resend-verification",   emailSendLimiter);                    // 3/15min
app.use("/api/v1/auth/forgot-password",       emailSendLimiter, forgotEmailLimiter);// IP + email: 3/15min + 3/h per email
app.use("/api/v1/auth/login",                 authLimiter, loginEmailLimiter);       // IP + email: 30/15min + 10/h per email
app.use("/api/v1/auth/register",              authLimiter);                          // 30/15min — IP only
app.use("/api/v1/auth/refresh",               refreshLimiter);                       // 60/15min — token brute-force
app.use("/api/v1",      apiLimiter);
app.use("/api/v1",      createRouter(io));

// ─── Health check ─────────────────────────────────────────────────────────────
// Version info — commit hash is injected by Railway automatically via RAILWAY_GIT_COMMIT_SHA
const APP_VERSION  = process.env.npm_package_version ?? "1.0.0";
const COMMIT_SHA   = (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? "local").slice(0, 7);
const BUILD_TIME   = new Date().toISOString();

app.get("/health", (_req, res) => res.json({
  status:    "ok",
  version:   APP_VERSION,
  commit:    COMMIT_SHA,
  buildTime: BUILD_TIME,
  timestamp: new Date().toISOString(),
}));

// Public version endpoint — frontend polls this to detect stale deploys
app.get("/api/v1/version", (_req, res) => res.json({
  version: APP_VERSION,
  commit:  COMMIT_SHA,
}));

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready`);
});
