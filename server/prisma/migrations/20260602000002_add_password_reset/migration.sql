-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pw_reset_token" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pw_reset_expires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_pw_reset_token_key" ON "users"("pw_reset_token");
