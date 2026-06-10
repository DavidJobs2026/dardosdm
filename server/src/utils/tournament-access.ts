import { AuthRequest } from "../middlewares/auth.middleware";

/**
 * Returns true if the requesting user may manage this tournament.
 *
 *  - admin        → always allowed
 *  - owner        → always allowed
 *  - co-organizer → allowed when the tournament was fetched with coOrganizers included
 *  - anyone else  → denied
 *
 * Fetch pattern:
 *   prisma.tournament.findUnique({
 *     where: { id },
 *     include: { coOrganizers: { select: { userId: true } } },
 *   })
 */
export function canManageTournament(
  tournament: { createdById: string; coOrganizers?: { userId: string }[] },
  req: AuthRequest,
): boolean {
  // req.user is undefined on routes that use optionalAuthenticate (anonymous
  // viewers, or clients that don't send a token). No user → cannot manage.
  const user = req.user;
  if (!user) return false;
  if (user.role === "admin") return true;
  if (tournament.createdById === user.userId) return true;
  return tournament.coOrganizers?.some(c => c.userId === user.userId) ?? false;
}

/** Convenience select shape — add to every tournament fetch that precedes a canManage check */
export const selectCoOrg = { userId: true } as const;
