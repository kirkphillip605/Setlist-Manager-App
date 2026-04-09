import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { gigs, gigSessions, setlists } from '../db/schema.js';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, type BandVariables } from '../middleware/band.js';

const app = new Hono<{ Variables: BandVariables }>();

const gigSchema = z.object({
  name:       z.string().min(1).max(200),
  start_time: z.string().datetime(),
  end_time:   z.string().datetime().nullable().optional(),
  notes:      z.string().default(''),
  setlist_id: z.string().uuid().nullable().optional(),
  venue_name: z.string().max(200).optional(),
  address:    z.string().max(300).optional(),
  city:       z.string().max(100).optional(),
  state:      z.string().max(100).optional(),
  zip:        z.string().max(20).optional(),
});

// GET /api/bands/:bandId/gigs
app.get('/', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');

  const rows = await db
    .select({ gig: gigs, setlist: { id: setlists.id, name: setlists.name } })
    .from(gigs)
    .leftJoin(setlists, eq(gigs.setlistId, setlists.id))
    .where(and(eq(gigs.bandId, bandId), isNull(gigs.deletedAt)))
    .orderBy(asc(gigs.startTime));

  return c.json(rows.map(r => ({ ...r.gig, setlist: r.setlist?.id ? r.setlist : null })));
});

// GET /api/bands/:bandId/gigs/:id
app.get('/:id', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const id = c.req.param('id');

  const [row] = await db
    .select({ gig: gigs, setlist: { id: setlists.id, name: setlists.name } })
    .from(gigs)
    .leftJoin(setlists, eq(gigs.setlistId, setlists.id))
    .where(and(eq(gigs.id, id), eq(gigs.bandId, bandId), isNull(gigs.deletedAt)))
    .limit(1);

  if (!row) return c.json({ error: 'Gig not found' }, 404);
  return c.json({ ...row.gig, setlist: row.setlist?.id ? row.setlist : null });
});

// POST /api/bands/:bandId/gigs
app.post('/', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', gigSchema),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const body = c.req.valid('json');

    const [gig] = await db.insert(gigs).values({
      bandId,
      createdBy: userId,
      name:      body.name,
      startTime: new Date(body.start_time),
      endTime:   body.end_time ? new Date(body.end_time) : null,
      notes:     body.notes,
      setlistId: body.setlist_id ?? null,
      venueName: body.venue_name ?? null,
      address:   body.address ?? null,
      city:      body.city ?? null,
      state:     body.state ?? null,
      zip:       body.zip ?? null,
    }).returning();

    return c.json(gig, 201);
  }
);

// PATCH /api/bands/:bandId/gigs/:id
app.patch('/:id', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', gigSchema.partial()),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [activeSession] = await db.select({ id: gigSessions.id }).from(gigSessions)
      .where(and(eq(gigSessions.gigId, id), eq(gigSessions.isActive, true)))
      .limit(1);
    if (activeSession) {
      return c.json({ error: 'Cannot edit gig while a performance session is active' }, 409);
    }

    const updates: Record<string, unknown> = { lastUpdatedBy: userId };
    if (body.name !== undefined)       updates.name = body.name;
    if (body.start_time !== undefined) updates.startTime = new Date(body.start_time);
    if (body.end_time !== undefined)   updates.endTime = body.end_time ? new Date(body.end_time) : null;
    if (body.notes !== undefined)      updates.notes = body.notes;
    if (body.setlist_id !== undefined) updates.setlistId = body.setlist_id;
    if (body.venue_name !== undefined) updates.venueName = body.venue_name;
    if (body.address !== undefined)    updates.address = body.address;
    if (body.city !== undefined)       updates.city = body.city;
    if (body.state !== undefined)      updates.state = body.state;
    if (body.zip !== undefined)        updates.zip = body.zip;

    const [gig] = await db.update(gigs).set(updates)
      .where(and(eq(gigs.id, id), eq(gigs.bandId, bandId), isNull(gigs.deletedAt)))
      .returning();

    if (!gig) return c.json({ error: 'Gig not found' }, 404);
    return c.json(gig);
  }
);

// POST /api/bands/:bandId/gigs/:id/cancel
app.post('/:id/cancel', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({ reason: z.string().optional() })),
  async (c) => {
    const bandId = c.get('bandId');
    const id = c.req.param('id');
    const { reason } = c.req.valid('json');

    const [activeSession] = await db.select({ id: gigSessions.id }).from(gigSessions)
      .where(and(eq(gigSessions.gigId, id), eq(gigSessions.isActive, true)))
      .limit(1);
    if (activeSession) {
      return c.json({ error: 'Cannot cancel gig while a performance session is active' }, 409);
    }

    const [gig] = await db.update(gigs)
      .set({ cancelledAt: new Date(), cancellationReason: reason ?? null })
      .where(and(eq(gigs.id, id), eq(gigs.bandId, bandId)))
      .returning();

    return c.json(gig);
  }
);

// DELETE /api/bands/:bandId/gigs/:id — soft delete
app.delete('/:id', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [activeSession] = await db.select({ id: gigSessions.id }).from(gigSessions)
    .where(and(eq(gigSessions.gigId, id), eq(gigSessions.isActive, true)))
    .limit(1);
  if (activeSession) {
    return c.json({ error: 'Cannot delete gig while a performance session is active' }, 409);
  }

  await db.update(gigs)
    .set({ deletedAt: new Date(), deletedBy: userId })
    .where(and(eq(gigs.id, id), eq(gigs.bandId, bandId)));

  return c.json({ success: true });
});

export default app;
