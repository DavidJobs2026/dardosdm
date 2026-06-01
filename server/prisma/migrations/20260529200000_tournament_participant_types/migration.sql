-- Change ParticipantType enum: replace user|team with individual|parejas|parejas_ciegas|trios|equipos
-- No data in tables so conversion is straightforward.

-- 1. Drop default first so the enum has no dependents, then convert to TEXT
ALTER TABLE "tournaments" ALTER COLUMN "participant_type" DROP DEFAULT;
ALTER TABLE "tournaments" ALTER COLUMN "participant_type" TYPE TEXT;
ALTER TABLE "participants" ALTER COLUMN "entity_type" TYPE TEXT;

-- 2. Drop old enum
DROP TYPE "ParticipantType";

-- 3. Create new enum
CREATE TYPE "ParticipantType" AS ENUM ('individual', 'parejas', 'parejas_ciegas', 'trios', 'equipos');

-- 4. Re-apply new enum type to columns (empty tables, USING clause is a no-op)
ALTER TABLE "tournaments"
  ALTER COLUMN "participant_type" TYPE "ParticipantType"
  USING "participant_type"::"ParticipantType";

ALTER TABLE "participants"
  ALTER COLUMN "entity_type" TYPE "ParticipantType"
  USING "entity_type"::"ParticipantType";

-- 5. Update column defaults
ALTER TABLE "tournaments"
  ALTER COLUMN "participant_type" SET DEFAULT 'individual'::"ParticipantType";

-- 6. Add new Tournament columns
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "team_size"  INTEGER;
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "max_metric" DOUBLE PRECISION;
