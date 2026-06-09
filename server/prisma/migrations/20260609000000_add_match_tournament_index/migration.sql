-- Add index on matches.tournament_id for faster per-tournament queries (listMatches, polling)
CREATE INDEX IF NOT EXISTS "matches_tournament_id_idx" ON "matches"("tournament_id");

-- Composite index for filtered queries (status filter used in active-match lookups)
CREATE INDEX IF NOT EXISTS "matches_tournament_id_status_idx" ON "matches"("tournament_id", "status");
