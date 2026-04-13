-- =============================================================
-- Auth Indexes & Verification Cleanup Migration
-- Adds performance indexes on auth tables
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"("userId");
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"("userId");
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"("token");
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"("identifier");
CREATE INDEX IF NOT EXISTS idx_verification_expires_at ON "verification"("expiresAt");

DELETE FROM "verification" WHERE "expiresAt" < NOW() - INTERVAL '7 days';
