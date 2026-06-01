-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "participant3_id" TEXT;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_participant3_id_fkey" FOREIGN KEY ("participant3_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
