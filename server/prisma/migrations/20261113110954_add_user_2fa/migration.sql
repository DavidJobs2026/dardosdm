-- Two-factor authentication (TOTP) fields on users.
ALTER TABLE "users" ADD COLUMN "two_factor_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "two_factor_recovery_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
