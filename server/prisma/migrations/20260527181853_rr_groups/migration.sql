-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "is_tiebreaker" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rr_group" TEXT;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "rr_group" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "rr_advancing_teams" INTEGER,
ADD COLUMN     "rr_group_size" INTEGER;
