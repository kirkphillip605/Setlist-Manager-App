import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { gigSessions, gigSessionParticipants, gigSkippedSongs, leadershipRequests, users, gigs } from '../db/schema.js';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, type BandVariables } from '../middleware/band.js';
import { wsManager } from '../ws/server.js';

const app = new Hono<{ Variables: BandVariables }>();

// GET /api/bands/:bandId/gig-sessions
app.get('/', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const rows = await db.select().from(gigSessions)
    .where(and(eq(gigSessions.bandId, bandId), eq(gigSessions.isActive, true)));
  return c.json(rows);
});

// GET /api/bands/:bandId/gig-sessions/active — active session for the current user
app.get('/active', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const userId = c.get('userId');

  // Find a session where user is leader
  let session = await db.select().from(gigSessions)
    .where(and(
      eq(gigSessions.bandId, bandId),
      eq(gigSessions.isActive, true),
      eq(gigSessions.leaderId, userId),
    )).limit(1).then(r => r[0] ?? null);

  if (!session) {
    // Find a session where user is a participant
    const participantRow = await db
      .select({ sessionId: gigSessionParticipants.sessionId })
      .from(gigSessionParticipants)
      .where(eq(gigSessionParticipants.userId, userId))
      .limit(1);

    if (participantRow.length > 0) {
      session = await db.select().from(gigSessions)
        .where(and(
          eq(gigSessions.id, participantRow[0].sessionId),
          eq(gigSessions.isActive, true),
        )).limit(1).then(r => r[0] ?? null);
    }
  }

  if (!session) return c.json(null);

  // Fetch gig for setlist_id
  const [gig] = await db.select({ setlistId: gigs.setlistId })
    .from(gigs).where(eq(gigs.id, session.gigId)).limit(1);

  return c.json({
    id:          session.id,
    gig_id:      session.gigId,
    is_on_break: session.isOnBreak,
    setlist_id:  gig?.setlistId ?? null,
  });
});

// GET /api/bands/:bandId/gig-sessions/gig/:gigId
app.get('/gig/:gigId', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const gigId  = c.req.param('gigId');

  const [session] = await db.select().from(gigSessions)
    .where(and(eq(gigSessions.gigId, gigId), eq(gigSessions.bandId, bandId)))
    .limit(1);

  if (!session) return c.json(null);

  // Enrich with leader name and participant IDs
  const [leader] = await db.select({ firstName: users.firstName, lastName: users.lastName })
    .from(users).where(eq(users.id, session.leaderId)).limit(1);

  const participants = await db
    .select({ userId: gigSessionParticipants.userId })
    .from(gigSessionParticipants)
    .where(eq(gigSessionParticipants.sessionId, session.id));

  return c.json({
    ...session,
    leader_name:     leader ? `${leader.firstName} ${leader.lastName}` : 'Leader',
    participant_ids: participants.map(p => p.userId),
  });
});

// POST /api/bands/:bandId/gig-sessions — start a session
app.post('/', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({ gig_id: z.string().uuid() })),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const { gig_id: gigId } = c.req.valid('json');

    // Remove any existing sessions for this gig
    const existing = await db.select({ id: gigSessions.id }).from(gigSessions)
      .where(eq(gigSessions.gigId, gigId));
    if (existing.length > 0) {
      const ids = existing.map(s => s.id);
      await db.delete(gigSessionParticipants).where(inArray(gigSessionParticipants.sessionId, ids));
      await db.delete(gigSessions).where(inArray(gigSessions.id, ids));
    }

    const [session] = await db.insert(gigSessions).values({
      bandId, gigId, leaderId: userId,
    }).returning();

    // Leader auto-joins as participant
    await db.insert(gigSessionParticipants).values({
      bandId, sessionId: session.id, userId, lastSeen: new Date(),
    });

    wsManager.broadcastToBand(bandId, { type: 'session_started', sessionId: session.id, gigId });
    return c.json(session, 201);
  }
);

// POST /api/bands/:bandId/gig-sessions/:id/join
app.post('/:id/join', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  await db.insert(gigSessionParticipants)
    .values({ bandId, sessionId, userId, lastSeen: new Date() })
    .onConflictDoUpdate({
      target: [gigSessionParticipants.sessionId, gigSessionParticipants.userId],
      set: { lastSeen: new Date() },
    });

  return c.json({ success: true });
});

// POST /api/bands/:bandId/gig-sessions/:id/leave
app.post('/:id/leave', requireAuth, requireBandMember, async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');

  await db.delete(gigSessionParticipants)
    .where(and(eq(gigSessionParticipants.sessionId, sessionId), eq(gigSessionParticipants.userId, userId)));

  return c.json({ success: true });
});

// PATCH /api/bands/:bandId/gig-sessions/:id/state
app.patch('/:id/state', requireAuth, requireBandMember,
  zValidator('json', z.object({
    current_set_index:  z.number().int().min(0).optional(),
    current_song_index: z.number().int().min(0).optional(),
    adhoc_song_id:      z.string().uuid().nullable().optional(),
    is_on_break:        z.boolean().optional(),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const sessionId = c.req.param('id');
    const body = c.req.valid('json');

    const updates: Record<string, unknown> = {};
    if (body.current_set_index !== undefined)  updates.currentSetIndex = body.current_set_index;
    if (body.current_song_index !== undefined) updates.currentSongIndex = body.current_song_index;
    if (body.adhoc_song_id !== undefined)      updates.adhocSongId = body.adhoc_song_id;
    if (body.is_on_break !== undefined)        updates.isOnBreak = body.is_on_break;

    const [session] = await db.update(gigSessions).set(updates)
      .where(and(eq(gigSessions.id, sessionId), eq(gigSessions.bandId, bandId)))
      .returning();

    wsManager.broadcastToSession(sessionId, { type: 'session_state', ...updates, sessionId });
    return c.json(session);
  }
);

// POST /api/bands/:bandId/gig-sessions/:id/heartbeat
app.post('/:id/heartbeat', requireAuth, requireBandMember, async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const isLeader = c.req.query('leader') === 'true';

  await db.update(gigSessionParticipants)
    .set({ lastSeen: new Date() })
    .where(and(eq(gigSessionParticipants.sessionId, sessionId), eq(gigSessionParticipants.userId, userId)));

  if (isLeader) {
    await db.update(gigSessions)
      .set({ lastHeartbeat: new Date() })
      .where(eq(gigSessions.id, sessionId));
  }

  return c.json({ success: true });
});

// GET /api/bands/:bandId/gig-sessions/:id/participants
app.get('/:id/participants', requireAuth, requireBandMember, async (c) => {
  const sessionId = c.req.param('id');

  const rows = await db
    .select({
      participant: gigSessionParticipants,
      user: { id: users.id, firstName: users.firstName, lastName: users.lastName, image: users.image },
    })
    .from(gigSessionParticipants)
    .innerJoin(users, eq(gigSessionParticipants.userId, users.id))
    .where(eq(gigSessionParticipants.sessionId, sessionId));

  return c.json(rows.map(r => ({ ...r.participant, profile: r.user })));
});

// DELETE /api/bands/:bandId/gig-sessions/:id — end session
app.delete('/:id', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');
  const sessionId = c.req.param('id');

  await db.delete(gigSessionParticipants).where(eq(gigSessionParticipants.sessionId, sessionId));
  await db.delete(gigSessions).where(and(eq(gigSessions.id, sessionId), eq(gigSessions.bandId, bandId)));

  wsManager.broadcastToSession(sessionId, { type: 'session_ended', sessionId });
  return c.json({ success: true });
});

// POST /api/bands/:bandId/gig-sessions/:id/leadership-request
app.post('/:id/leadership-request', requireAuth, requireBandMember,
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const sessionId = c.req.param('id');

    const [request] = await db.insert(leadershipRequests).values({
      bandId, sessionId, requesterId: userId,
    }).returning();

    wsManager.broadcastToSession(sessionId, { type: 'leadership_request', requestId: request.id, requesterId: userId });
    return c.json(request, 201);
  }
);

// PATCH /api/bands/:bandId/gig-sessions/:id/leadership-request/:requestId
app.patch('/:id/leadership-request/:requestId', requireAuth, requireBandMember,
  zValidator('json', z.object({ status: z.enum(['approved', 'denied']) })),
  async (c) => {
    const sessionId = c.req.param('id');
    const requestId = c.req.param('requestId');
    const { status } = c.req.valid('json');

    const [request] = await db.update(leadershipRequests)
      .set({ status })
      .where(eq(leadershipRequests.id, requestId))
      .returning();

    if (status === 'approved') {
      await db.update(gigSessions)
        .set({ leaderId: request.requesterId, lastHeartbeat: new Date() })
        .where(eq(gigSessions.id, sessionId));
    }

    wsManager.broadcastToSession(sessionId, {
      type: 'leadership_response', requestId, status, newLeaderId: status === 'approved' ? request.requesterId : null,
    });
    return c.json(request);
  }
);

// POST /api/bands/:bandId/gig-sessions/:id/force-leadership
app.post('/:id/force-leadership', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({ user_id: z.string() })),
  async (c) => {
    const bandId = c.get('bandId');
    const sessionId = c.req.param('id');
    const { user_id: newLeaderId } = c.req.valid('json');

    const [session] = await db.update(gigSessions)
      .set({ leaderId: newLeaderId, lastHeartbeat: new Date() })
      .where(and(eq(gigSessions.id, sessionId), eq(gigSessions.bandId, bandId)))
      .returning();

    wsManager.broadcastToSession(sessionId, { type: 'leader_changed', newLeaderId, sessionId });
    return c.json(session);
  }
);

// GET /api/bands/:bandId/gig-sessions/:id/skipped-songs
app.get('/:id/skipped-songs', requireAuth, requireBandMember, async (c) => {
  const gigId = c.req.query('gig_id');
  if (!gigId) return c.json({ error: 'gig_id required' }, 400);

  const { songs } = await import('../db/schema.js');
  const rows = await db
    .select({ ss: gigSkippedSongs, song: songs })
    .from(gigSkippedSongs)
    .innerJoin(songs, eq(gigSkippedSongs.songId, songs.id))
    .where(eq(gigSkippedSongs.gigId, gigId));

  return c.json(rows.map(r => r.song));
});

// POST /api/bands/:bandId/gig-sessions/:id/skipped-songs
app.post('/:id/skipped-songs', requireAuth, requireBandMember,
  zValidator('json', z.object({ gig_id: z.string().uuid(), song_id: z.string().uuid() })),
  async (c) => {
    const bandId = c.get('bandId');
    const { gig_id: gigId, song_id: songId } = c.req.valid('json');

    await db.insert(gigSkippedSongs)
      .values({ bandId, gigId, songId })
      .onConflictDoNothing();

    return c.json({ success: true });
  }
);

// DELETE /api/bands/:bandId/gig-sessions/:id/skipped-songs
app.delete('/:id/skipped-songs', requireAuth, requireBandMember,
  zValidator('json', z.object({ gig_id: z.string().uuid(), song_id: z.string().uuid() })),
  async (c) => {
    const { gig_id: gigId, song_id: songId } = c.req.valid('json');
    await db.delete(gigSkippedSongs).where(and(eq(gigSkippedSongs.gigId, gigId), eq(gigSkippedSongs.songId, songId)));
    return c.json({ success: true });
  }
);

export default app;
