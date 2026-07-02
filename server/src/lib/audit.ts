import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { AuthRequest } from "../middlewares/auth.middleware";

export type AuditAction =
  | "tournament.create"
  | "tournament.update"
  | "tournament.delete"
  | "tournament.start"
  | "tournament.finalize"
  | "tournament.reset"
  | "tournament.open_registration"
  | "tournament.close_registration"
  | "participant.add"
  | "participant.remove"
  | "participant.payment"
  | "participant.no_show"
  | "match.report"
  | "match.reset"
  | "match.recall"
  | "user.register"        // new player account created via public registration
  | "user.login"
  | "user.profile_update"  // organizer/admin edited a user's profile
  | "user.password_reset"  // password changed via reset flow
  | "user.ghost_absorb"    // ghost account merged into real user
  | "user.batch_create"    // bulk player creation from historico
  | "user.role_change"
  | "user.reset_password"
  | "user.self_delete"     // GDPR erasure — record kept without PII as deletion proof
  | "user.ban";

interface AuditParams {
  req: AuthRequest;
  action: AuditAction;
  entityType: "tournament" | "match" | "participant" | "user";
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
}

export async function audit(params: AuditParams): Promise<void> {
  const { req, action, entityType, entityId, entityName, details } = params;
  const userId = req.user?.userId;
  if (!userId) return;

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    undefined;

  auditRaw({ userId, action, entityType, entityId, entityName, details, ip });
}

/** Log an action when there is no authenticated req.user (e.g. public registration). */
export function auditRaw(params: {
  userId:      string;
  action:      AuditAction;
  entityType:  "tournament" | "match" | "participant" | "user";
  entityId?:   string;
  entityName?: string;
  details?:    Record<string, unknown>;
  ip?:         string | null;
}): void {
  const { userId, action, entityType, entityId, entityName, details, ip } = params;

  // Fire-and-forget — never block the main request
  prisma.auditLog
    .create({
      data: {
        userId,
        action,
        entityType,
        entityId:   entityId   ?? null,
        entityName: entityName ?? null,
        details:    details != null ? (details as Prisma.InputJsonValue) : Prisma.JsonNull,
        ip:         ip         ?? null,
      },
    })
    .catch((err: unknown) => console.error("[audit] failed to write log:", err));
}
