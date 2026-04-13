-- =============================================================
-- Multi-Tenant Schema Enhancements
-- Adds: bio on user, is_default on memberships, band_support,
--        platform_bans, email-based band bans
-- =============================================================

-- ---------------------------------------------------------------
-- Add bio to user table
-- ---------------------------------------------------------------
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bio" TEXT;

-- ---------------------------------------------------------------
-- Add is_default to band_memberships
-- Only one membership per user can be the default
-- ---------------------------------------------------------------
ALTER TABLE band_memberships ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_band_memberships_user_default
  ON band_memberships (user_id)
  WHERE is_default = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- Enhance band_bans: allow banning by email (pre-account)
-- ---------------------------------------------------------------
ALTER TABLE band_bans ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE band_bans ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE band_bans DROP CONSTRAINT IF EXISTS band_bans_user_or_email;
ALTER TABLE band_bans ADD CONSTRAINT band_bans_user_or_email
  CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- ---------------------------------------------------------------
-- Band support — assign support staff to specific bands
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS band_support (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id    UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  granted_by TEXT NOT NULL REFERENCES "user"("id"),
  granted_at TIMESTAMP NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_band_support_band ON band_support(band_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_band_support_user ON band_support(user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------
-- Platform bans — platform-wide bans by admins
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_bans (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   TEXT REFERENCES "user"("id"),
  email     TEXT NOT NULL,
  banned_by TEXT NOT NULL REFERENCES "user"("id"),
  banned_at TIMESTAMP NOT NULL DEFAULT now(),
  ban_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_bans_email ON platform_bans(email);
CREATE INDEX IF NOT EXISTS idx_platform_bans_user  ON platform_bans(user_id) WHERE user_id IS NOT NULL;
