-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "launch1_at" TIMESTAMP(3),
ADD COLUMN     "launch2_at" TIMESTAMP(3),
ADD COLUMN     "launch3_at" TIMESTAMP(3),
ADD COLUMN     "no_show_at" TIMESTAMP(3),
ADD COLUMN     "no_show_reason" TEXT;

-- CreateTable
CREATE TABLE "dianas" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "match_id" TEXT,

    CONSTRAINT "dianas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dianas_match_id_key" ON "dianas"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "dianas_tournament_id_number_key" ON "dianas"("tournament_id", "number");

-- AddForeignKey
ALTER TABLE "dianas" ADD CONSTRAINT "dianas_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dianas" ADD CONSTRAINT "dianas_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
