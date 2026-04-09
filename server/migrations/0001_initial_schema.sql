-- =============================================================
-- SetlistPRO Initial Schema
-- Covers: BetterAuth tables, multi-tenant bands, all data tables
-- =============================================================

-- ---------------------------------------------------------------
-- BetterAuth managed tables (camelCase columns per BetterAuth spec)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image"         TEXT,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
  -- Extended profile fields (additionalFields in BetterAuth config)
  "firstName"     TEXT,
  "lastName"      TEXT,
  "phone"         TEXT,
  "phoneVerified" BOOLEAN DEFAULT false,
  "platformRole"  TEXT NOT NULL DEFAULT 'user', -- 'user' | 'platform_admin' | 'platform_support'
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "preferences"   JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"                   TEXT PRIMARY KEY,
  "expiresAt"            TIMESTAMP NOT NULL,
  "token"                TEXT NOT NULL UNIQUE,
  "createdAt"            TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMP NOT NULL DEFAULT now(),
  "ipAddress"            TEXT,
  "userAgent"            TEXT,
  "userId"               TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                       TEXT PRIMARY KEY,
  "accountId"                TEXT NOT NULL,
  "providerId"               TEXT NOT NULL,
  "userId"                   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"              TEXT,
  "refreshToken"             TEXT,
  "idToken"                  TEXT,
  "accessTokenExpiresAt"     TIMESTAMP,
  "refreshTokenExpiresAt"    TIMESTAMP,
  "scope"                    TEXT,
  "password"                 TEXT,
  "createdAt"                TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"                TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"          TEXT PRIMARY KEY,
  "identifier"  TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  "expiresAt"   TIMESTAMP NOT NULL,
  "createdAt"   TIMESTAMP DEFAULT now(),
  "updatedAt"   TIMESTAMP DEFAULT now()
);

-- ---------------------------------------------------------------
-- Version sequence — globally monotonic, used for delta sync
-- ---------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS global_version_seq START 1;

-- ---------------------------------------------------------------
-- Trigger function: auto-set version, updated_at, and pg_notify
-- Attach as BEFORE INSERT OR UPDATE on all tracked tables
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_version_and_notify()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version    := nextval('global_version_seq');
  NEW.updated_at := now();
  IF NEW.band_id IS NOT NULL THEN
    PERFORM pg_notify(
      'band_changes',
      json_build_object(
        'band_id', NEW.band_id::text,
        'table',   TG_TABLE_NAME,
        'version', NEW.version
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- Join code generator — charset excludes O, 0, I, 1, 8, B
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
  chars  TEXT    := 'ACDEFGHJKLMNPQRSTUVWXYZ23456799';
  result TEXT    := '';
  i      INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-assign unique join code on band insert
CREATE OR REPLACE FUNCTION assign_band_join_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    LOOP
      NEW.join_code := generate_join_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM bands WHERE join_code = NEW.join_code);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- get_current_band_version(band_id) — returns max version for a band
-- Used by delta sync endpoint
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_band_version(p_band_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v BIGINT;
BEGIN
  SELECT GREATEST(
    COALESCE((SELECT MAX(version) FROM songs              WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM setlists           WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM sets               WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM set_songs          WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM gigs               WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM gig_sessions       WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM gig_session_participants WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM gig_skipped_songs  WHERE band_id = p_band_id), 0),
    COALESCE((SELECT MAX(version) FROM leadership_requests WHERE band_id = p_band_id), 0)
  ) INTO v;
  RETURN COALESCE(v, 0);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- Multi-tenant tables
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  join_code   CHAR(6) NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES "user"("id"),
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMP,
  deleted_by  TEXT REFERENCES "user"("id")
);

CREATE TRIGGER bands_join_code_trigger
  BEFORE INSERT ON bands
  FOR EACH ROW EXECUTE FUNCTION assign_band_join_code();

CREATE TABLE IF NOT EXISTS band_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id     UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'manager' | 'member'
  position    TEXT,                           -- instrument / role in the band
  is_approved BOOLEAN NOT NULL DEFAULT false,
  invited_by  TEXT REFERENCES "user"("id"),
  joined_at   TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMP,
  UNIQUE (band_id, user_id)
);

CREATE TABLE IF NOT EXISTS band_bans (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id   UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES "user"("id"),
  banned_by TEXT NOT NULL REFERENCES "user"("id"),
  reason    TEXT,
  banned_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Data tables — all scoped by band_id, all have version column
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS songs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id         UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  lyrics          TEXT NOT NULL DEFAULT '',
  key             TEXT NOT NULL DEFAULT '',
  tempo           TEXT NOT NULL DEFAULT '',
  duration        TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  cover_url       TEXT,
  spotify_url     TEXT,
  is_retired      BOOLEAN NOT NULL DEFAULT false,
  created_by      TEXT REFERENCES "user"("id"),
  last_updated_by TEXT REFERENCES "user"("id"),
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMP,
  deleted_by      TEXT REFERENCES "user"("id"),
  version         BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER songs_version_notify
  BEFORE INSERT OR UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS setlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id         UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_personal     BOOLEAN NOT NULL DEFAULT false,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_by      TEXT REFERENCES "user"("id"),
  last_updated_by TEXT REFERENCES "user"("id"),
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMP,
  deleted_by      TEXT REFERENCES "user"("id"),
  version         BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER setlists_version_notify
  BEFORE INSERT OR UPDATE ON setlists
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS sets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id    UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  setlist_id UUID NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_by TEXT REFERENCES "user"("id"),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP,
  deleted_by TEXT REFERENCES "user"("id"),
  version    BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER sets_version_notify
  BEFORE INSERT OR UPDATE ON sets
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS set_songs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id    UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  set_id     UUID NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  song_id    UUID NOT NULL REFERENCES songs(id),
  position   INTEGER NOT NULL,
  created_by TEXT REFERENCES "user"("id"),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP,
  deleted_by TEXT REFERENCES "user"("id"),
  version    BIGINT NOT NULL DEFAULT 0,
  UNIQUE (set_id, position)
);

CREATE TRIGGER set_songs_version_notify
  BEFORE INSERT OR UPDATE ON set_songs
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS gigs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id             UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  start_time          TIMESTAMP NOT NULL,
  end_time            TIMESTAMP,
  notes               TEXT NOT NULL DEFAULT '',
  setlist_id          UUID REFERENCES setlists(id),
  venue_name          TEXT,
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  created_by          TEXT REFERENCES "user"("id"),
  last_updated_by     TEXT REFERENCES "user"("id"),
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMP,
  deleted_by          TEXT REFERENCES "user"("id"),
  cancelled_at        TIMESTAMP,
  cancellation_reason TEXT,
  version             BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER gigs_version_notify
  BEFORE INSERT OR UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS gig_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id           UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  gig_id            UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  leader_id         TEXT NOT NULL REFERENCES "user"("id"),
  current_set_index INTEGER NOT NULL DEFAULT 0,
  current_song_index INTEGER NOT NULL DEFAULT 0,
  adhoc_song_id     UUID REFERENCES songs(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  is_on_break       BOOLEAN NOT NULL DEFAULT false,
  started_at        TIMESTAMP NOT NULL DEFAULT now(),
  last_heartbeat    TIMESTAMP NOT NULL DEFAULT now(),
  ended_at          TIMESTAMP,
  version           BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER gig_sessions_version_notify
  BEFORE INSERT OR UPDATE ON gig_sessions
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS gig_session_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id    UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES gig_sessions(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"("id"),
  last_seen  TIMESTAMP NOT NULL DEFAULT now(),
  version    BIGINT NOT NULL DEFAULT 0,
  UNIQUE (session_id, user_id)
);

CREATE TRIGGER gig_session_participants_version_notify
  BEFORE INSERT OR UPDATE ON gig_session_participants
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS gig_skipped_songs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id    UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  gig_id     UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  song_id    UUID NOT NULL REFERENCES songs(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  version    BIGINT NOT NULL DEFAULT 0,
  UNIQUE (gig_id, song_id)
);

CREATE TRIGGER gig_skipped_songs_version_notify
  BEFORE INSERT OR UPDATE ON gig_skipped_songs
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

CREATE TABLE IF NOT EXISTS leadership_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id      UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES gig_sessions(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES "user"("id"),
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'denied'
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  version      BIGINT NOT NULL DEFAULT 0
);

CREATE TRIGGER leadership_requests_version_notify
  BEFORE INSERT OR UPDATE ON leadership_requests
  FOR EACH ROW EXECUTE FUNCTION update_version_and_notify();

-- ---------------------------------------------------------------
-- Indexes for common query patterns
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_songs_band_id        ON songs(band_id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_setlists_band_id     ON setlists(band_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sets_setlist_id      ON sets(setlist_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_set_songs_set_id     ON set_songs(set_id)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gigs_band_id         ON gigs(band_id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gig_sessions_gig_id  ON gig_sessions(gig_id);
CREATE INDEX IF NOT EXISTS idx_band_memberships_user ON band_memberships(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_band_memberships_band ON band_memberships(band_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_songs_version        ON songs(version);
CREATE INDEX IF NOT EXISTS idx_setlists_version     ON setlists(version);
CREATE INDEX IF NOT EXISTS idx_gigs_version         ON gigs(version);
