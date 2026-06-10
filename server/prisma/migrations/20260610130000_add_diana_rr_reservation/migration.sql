-- Add RR group reservation columns to dianas (persisted server-side)
ALTER TABLE "dianas" ADD COLUMN "rr_group" TEXT;
ALTER TABLE "dianas" ADD COLUMN "rr_level" TEXT;
