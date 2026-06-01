-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "metric_value" DOUBLE PRECISION,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "payment_status" TEXT;
