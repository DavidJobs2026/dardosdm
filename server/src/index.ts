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

// Trust the first proxy (Nginx / Cloudflare / load balancer) so that
// express-rate-limit reads the real client IP from X-Forwarded-For
// instead of always seeing the proxy's IP.
app.set("trust proxy", 1);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));
// Skip logging for routes that have sensitive tokens in the URL (e.g. ?token=xxx)
app.use(morgan("dev", {
  skip: (req) => req.path.includes("verify-email"),
}));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
// Strict limiter for login/register only (brute-force protection).
// Mounted explicitly on /auth/login and /auth/register — does NOT apply to /refresh.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  message: "Demasiados intentos, espera un momento",
  standardHeaders: true,
  legacyHeaders: false,
});
// Tight limiter for check-email / check-phone — prevents bulk user enumeration
const enumerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: "Demasiadas consultas, espera un momento",
  standardHeaders: true,
  legacyHeaders: false,
});
// Very tight limiter for email-sending endpoints — prevents email spam / cost abuse
const emailSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 3,
  message: "Demasiados intentos de reenvío, espera 15 minutos",
  standardHeaders: true,
  legacyHeaders: false,
});
// Generous limiter for all other API calls (organizer can inscribe many players)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: "Too many requests",
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
app.use("/api/v1/auth/check-email",           enumerationLimiter); // 20/15min — prevents bulk enumeration
app.use("/api/v1/auth/check-phone",           enumerationLimiter);
app.use("/api/v1/auth/check-dni",             enumerationLimiter); // 20/15min — prevents DNI enumeration
app.use("/api/v1/auth/request-verification",  emailSendLimiter);   // 3/15min — prevents email spam
app.use("/api/v1/auth/resend-verification",   emailSendLimiter);   // 3/15min — same protection authenticated
app.use("/api/v1/auth/login",                 authLimiter);        // 30/15min — brute-force on login
app.use("/api/v1/auth/register",              authLimiter);        // 30/15min — brute-force on register
app.use("/api/v1",      apiLimiter);
app.use("/api/v1",      createRouter(io));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready`);
});
