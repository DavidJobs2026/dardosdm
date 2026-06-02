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
  | "user.role_change"
  | "user.reset_password"
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
