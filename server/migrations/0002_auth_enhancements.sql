-- =============================================================
-- Auth Enhancements Migration
-- Adds: isProfileComplete column, twoFactor table
-- =============================================================

-- ---------------------------------------------------------------
-- Add isProfileComplete flag to user table
-- ---------------------------------------------------------------
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "isProfileComplete" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark existing users with first+last name as complete
UPDATE "user"
SET "isProfileComplete" = true
WHERE "firstName" IS NOT NULL
  AND "lastName" IS NOT NULL
  AND "firstName" != ''
  AND "lastName" != '';

-- ---------------------------------------------------------------
-- BetterAuth twoFactor plugin table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id"          TEXT PRIMARY KEY,
  "secret"      TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  UNIQUE ("userId")
);

CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON "twoFactor"("userId");
