-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "best_of" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "best_of_losers" INTEGER;
