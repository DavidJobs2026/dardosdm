-- ─── 1. AuditLog: preserve logs when a user is deleted (SET NULL instead of CASCADE) ───
-- Make user_id nullable so Postgres can set it to NULL on user deletion
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- Swap the FK constraint: CASCADE → SET NULL
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 2. Participant: index for pending-inscription queries ────────────────────
-- Speeds up GET /tournaments/:id/pending-inscriptions and the organizer panel
CREATE INDEX "participants_tournament_id_inscription_status_idx"
  ON "participants"("tournament_id", "inscription_status");

-- ─── 3. PlayerRecord: GIN trigram index for case-insensitive name search ─────
-- Enables fast ILIKE '%query%' used in listPlayerRecords and searchForInscription
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "player_records_name_trgm_idx"
  ON "player_records" USING GIN ("name" gin_trgm_ops);
