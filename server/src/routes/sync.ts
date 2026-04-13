import { Hono } from 'hono';
import { db } from '../db/index.js';
import {
  songs, setlists, sets, setSongs, gigs,
  gigSessions, gigSessionParticipants, gigSkippedSongs,
  leadershipRequests, bandMemberships, bands,
} from '../db/schema.js';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

const TRACKED_TABLES = [
  { key: 'songs',                    table: songs,                    col: songs.bandId },
  { key: 'setlists',                 table: setlists,                 col: setlists.bandId },
  { key: 'sets',                     table: sets,                     col: sets.bandId },
  { key: 'set_songs',                table: setSongs,                  col: setSongs.bandId },
  { key: 'gigs',                     table: gigs,                     col: gigs.bandId },
  { key: 'gig_sessions',             table: gigSessions,              col: gigSessions.bandId },
  { key: 'gig_session_participants', table: gigSessionParticipants,   col: gigSessionParticipants.bandId },
  { key: 'gig_skipped_songs',        table: gigSkippedSongs,          col: gigSkippedSongs.bandId },
  { key: 'leadership_requests',      table: leadershipRequests,       col: leadershipRequests.bandId },
] as const;

// GET /api/sync/bootstrap — fetch all data for all of the user's bands at once
// Called once on login. Response is keyed by band_id.
app.get('/bootstrap', requireAuth, async (c) => {
  const userId = c.get('userId');

  // Resolve all approved bands for this user
  const memberships = await db
    .select({ bandId: bandMemberships.bandId, membership: bandMemberships, band: bands })
    .from(bandMemberships)
    .innerJoin(bands, eq(bandMemberships.bandId, bands.id))
    .where(and(
      eq(bandMemberships.userId, userId),
      eq(bandMemberships.isApproved, true),
      isNull(bandMemberships.deletedAt),
      isNull(bands.deletedAt),
    ));

  if (memberships.length === 0) return c.json({ bands: {} });

  const result: Record<string, {
    band: typeof bands.$inferSelect;
    membership: typeof bandMemberships.$inferSelect;
    version: number;
    songs: unknown[];
    setlists: unknown[];
    sets: unknown[];
    set_songs: unknown[];
    gigs: unknown[];
    gig_sessions: unknown[];
    gig_session_participants: unknown[];
    gig_skipped_songs: unknown[];
    leadership_requests: unknown[];
  }> = {};

  await Promise.all(memberships.map(async ({ bandId, band, membership }) => {
    const bandUUID = bandId as string;

    const [
      songsData, setlistsData, setsData, setSongsData,
      gigsData, gigSessionsData, gigParticipantsData,
      skippedData, leadershipData,
    ] = await Promise.all([
      db.select().from(songs).where(eq(songs.bandId, bandUUID)),
      db.select().from(setlists).where(eq(setlists.bandId, bandUUID)),
      db.select().from(sets).where(eq(sets.bandId, bandUUID)),
      db.select().from(setSongs).where(eq(setSongs.bandId, bandUUID)),
      db.select().from(gigs).where(eq(gigs.bandId, bandUUID)),
      db.select().from(gigSessions).where(eq(gigSessions.bandId, bandUUID)),
      db.select().from(gigSessionParticipants).where(eq(gigSessionParticipants.bandId, bandUUID)),
      db.select().from(gigSkippedSongs).where(eq(gigSkippedSongs.bandId, bandUUID)),
      db.select().from(leadershipRequests).where(eq(leadershipRequests.bandId, bandUUID)),
    ]);

    // Compute current max version for this band
    const versionResult = await db.execute<{ v: string }>(
      sql`SELECT get_current_band_version(${bandUUID}::uuid) AS v`
    );
    const version = parseInt(versionResult.rows[0]?.v ?? '0', 10);

    result[bandUUID] = {
      band,
      membership,
      version,
      songs:                    songsData,
      setlists:                 setlistsData,
      sets:                     setsData,
      set_songs:                setSongsData,
      gigs:                     gigsData,
      gig_sessions:             gigSessionsData,
      gig_session_participants: gigParticipantsData,
      gig_skipped_songs:        skippedData,
      leadership_requests:      leadershipData,
    };
  }));

  return c.json({ bands: result });
});

// GET /api/sync/delta?band_id=X&since_version=Y — fetch changes since a version
app.get('/delta', requireAuth, async (c) => {
  const userId = c.get('userId');
  const bandId = c.req.query('band_id');
  const sinceVersion = parseInt(c.req.query('since_version') ?? '0', 10);

  if (!bandId) return c.json({ error: 'band_id required' }, 400);

  // Verify membership
  const [membership] = await db.select().from(bandMemberships)
    .where(and(
      eq(bandMemberships.bandId, bandId),
      eq(bandMemberships.userId, userId),
      eq(bandMemberships.isApproved, true),
      isNull(bandMemberships.deletedAt),
    )).limit(1);

  if (!membership) return c.json({ error: 'Not a member of this band' }, 403);

  // Fetch deltas in parallel across all tracked tables
  const [
    songsData, setlistsData, setsData, setSongsData,
    gigsData, gigSessionsData, gigParticipantsData,
    skippedData, leadershipData,
  ] = await Promise.all([
    db.select().from(songs).where(and(eq(songs.bandId, bandId), gt(songs.version, sinceVersion))),
    db.select().from(setlists).where(and(eq(setlists.bandId, bandId), gt(setlists.version, sinceVersion))),
    db.select().from(sets).where(and(eq(sets.bandId, bandId), gt(sets.version, sinceVersion))),
    db.select().from(setSongs).where(and(eq(setSongs.bandId, bandId), gt(setSongs.version, sinceVersion))),
    db.select().from(gigs).where(and(eq(gigs.bandId, bandId), gt(gigs.version, sinceVersion))),
    db.select().from(gigSessions).where(and(eq(gigSessions.bandId, bandId), gt(gigSessions.version, sinceVersion))),
    db.select().from(gigSessionParticipants).where(and(eq(gigSessionParticipants.bandId, bandId), gt(gigSessionParticipants.version, sinceVersion))),
    db.select().from(gigSkippedSongs).where(and(eq(gigSkippedSongs.bandId, bandId), gt(gigSkippedSongs.version, sinceVersion))),
    db.select().from(leadershipRequests).where(and(eq(leadershipRequests.bandId, bandId), gt(leadershipRequests.version, sinceVersion))),
  ]);

  const versionResult = await db.execute<{ v: string }>(
    sql`SELECT get_current_band_version(${bandId}::uuid) AS v`
  );
  const currentVersion = parseInt(versionResult.rows[0]?.v ?? '0', 10);

  return c.json({
    band_id: bandId,
    since_version: sinceVersion,
    current_version: currentVersion,
    songs:                    songsData,
    setlists:                 setlistsData,
    sets:                     setsData,
    set_songs:                setSongsData,
    gigs:                     gigsData,
    gig_sessions:             gigSessionsData,
    gig_session_participants: gigParticipantsData,
    gig_skipped_songs:        skippedData,
    leadership_requests:      leadershipData,
  });
});

// GET /api/sync/version?band_id=X — quick check of current version
app.get('/version', requireAuth, async (c) => {
  const userId = c.get('userId');
  const bandId = c.req.query('band_id');
  if (!bandId) return c.json({ error: 'band_id required' }, 400);

  const [membership] = await db.select({ id: bandMemberships.id, isApproved: bandMemberships.isApproved }).from(bandMemberships)
    .where(and(
      eq(bandMemberships.bandId, bandId),
      eq(bandMemberships.userId, userId),
      isNull(bandMemberships.deletedAt),
    )).limit(1);

  if (!membership) return c.json({ error: 'Forbidden' }, 403);
  if (!membership.isApproved) return c.json({ error: 'Membership pending approval' }, 403);

  const result = await db.execute<{ v: string }>(
    sql`SELECT get_current_band_version(${bandId}::uuid) AS v`
  );
  return c.json({ version: parseInt(result.rows[0]?.v ?? '0', 10) });
});

export default app;
