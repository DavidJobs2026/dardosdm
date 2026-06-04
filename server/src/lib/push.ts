import webpush from "web-push";
import { prisma } from "./prisma";

// ─── VAPID initialisation ─────────────────────────────────────────────────────
// Keys are generated once with: npx web-push generate-vapid-keys
// and stored in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars.
const publicKey  = process.env.VAPID_PUBLIC_KEY  ?? "";
const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
const subject    = process.env.VAPID_SUBJECT      ?? "mailto:admin@dardosdm.com";

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled");
}

// ─── Send push to all subscriptions of a user ─────────────────────────────────
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set — skipping push for userId:", userId);
    return;
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });

  if (subs.length === 0) {
    // Help diagnose mismatched userId — show which users DO have subscriptions
    const allSubs = await prisma.pushSubscription.findMany({
      select: { userId: true, user: { select: { name: true, email: true } } },
    });
    const subSummary = allSubs.map(s => `${s.userId}(${s.user?.name ?? "?"})`).join(", ");
    console.warn(`[push] userId=${userId} → 0 subs. Users WITH subs: [${subSummary || "NONE"}]`);
  } else {
    console.log(`[push] userId=${userId} → ${subs.length} subscriptions found`);
  }
  if (!subs.length) return;

  const json = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json
        );
        console.log(`[push] sent OK to ...${sub.endpoint.slice(-30)}`);
      } catch (err: any) {
        // 410 Gone = subscription expired/revoked — remove it from DB
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          console.warn(`[push] subscription expired (${err.statusCode}), removing: ...${sub.endpoint.slice(-30)}`);
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.warn(`[push] failed to send to ...${sub.endpoint.slice(-30)}:`, err?.statusCode, err?.message ?? err);
        }
      }
    })
  );
}
