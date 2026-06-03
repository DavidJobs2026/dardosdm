import { Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { badRequest } from "../utils/errors";

// ── Push endpoint whitelist ────────────────────────────────────────────────────
// Only real browser push service domains are accepted. This prevents SSRF:
// an attacker could register endpoint="http://169.254.169.254/..." and cause
// the server to call cloud metadata services on every match result notification.
//
// Allowed services (all require HTTPS):
//   Chrome/Android : fcm.googleapis.com
//   Firefox        : updates.push.services.mozilla.com
//   Safari/iOS     : web.push.apple.com, api.push.apple.com, *.push.apple.com
//   Edge/Windows   : *.notify.windows.com, wns2-*.notify.windows.com
const PUSH_ENDPOINT_WHITELIST = [
  /^https:\/\/fcm\.googleapis\.com\//,
  /^https:\/\/updates\.push\.services\.mozilla\.com\//,
  /^https:\/\/[a-z0-9-]+\.push\.apple\.com\//,
  /^https:\/\/web\.push\.apple\.com\//,
  /^https:\/\/api\.push\.apple\.com\//,
  /^https:\/\/[a-z0-9-]+\.notify\.windows\.com\//,
  /^https:\/\/wns2-[a-z0-9-]+\.notify\.windows\.com\//,
];

function isAllowedPushEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be HTTPS (no http://, no file://, no internal schemes)
    if (parsed.protocol !== "https:") return false;
    // Must not point to private/internal addresses
    const host = parsed.hostname;
    if (
      host === "localhost" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("169.254.") ||  // link-local / cloud metadata
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
    ) return false;
    // Must match a known push service domain
    return PUSH_ENDPOINT_WHITELIST.some(re => re.test(url));
  } catch {
    return false;
  }
}

export const subscribePush = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { endpoint, keys } = z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }).parse(req.body);

    // SSRF protection: reject endpoints that don't belong to known push services
    if (!isAllowedPushEndpoint(endpoint)) {
      return next(badRequest("Endpoint de notificaciones no válido"));
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user!.userId },
      create: { userId: req.user!.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    return res.json({ message: "Suscripción guardada" });
  } catch (err) { next(err); }
};

export const unsubscribePush = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.userId } });
    return res.json({ message: "Suscripción eliminada" });
  } catch (err) { next(err); }
};
