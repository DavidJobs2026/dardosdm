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
  if (req.user!.role === "admin") return true;
  if (tournament.createdById === req.user!.userId) return true;
  return tournament.coOrganizers?.some(c => c.userId === req.user!.userId) ?? false;
}

/** Convenience select shape — add to every tournament fetch that precedes a canManage check */
export const selectCoOrg = { userId: true } as const;
