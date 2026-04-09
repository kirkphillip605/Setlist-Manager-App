import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { songs } from '../db/schema.js';
import { and, eq, isNull, ilike, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, type BandVariables } from '../middleware/band.js';

const app = new Hono<{ Variables: BandVariables }>();

const songSchema = z.object({
  title:      z.string().min(1).max(200),
  artist:     z.string().min(1).max(200),
  lyrics:     z.string().default(''),
  key:        z.string().max(20).default(''),
  tempo:      z.string().max(50).default(''),
  duration:   z.string().max(20).default(''),
  note:       z.string().max(2000).default(''),
  cover_url:  z.string().url().nullable().optional(),
  spotify_url: z.string().url().nullable().optional(),
  is_retired: z.boolean().default(false),
});

// GET /api/bands/:bandId/songs
app.get('/', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const q = c.req.query('q');

  const conditions = [eq(songs.bandId, bandId), isNull(songs.deletedAt)];
  if (q) {
    conditions.push(or(ilike(songs.title, `%${q}%`), ilike(songs.artist, `%${q}%`))!);
  }

  const rows = await db.select().from(songs)
    .where(and(...conditions))
    .orderBy(songs.title);

  return c.json(rows);
});

// GET /api/bands/:bandId/songs/:id
app.get('/:id', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const id = c.req.param('id');

  const [song] = await db.select().from(songs)
    .where(and(eq(songs.id, id), eq(songs.bandId, bandId), isNull(songs.deletedAt)))
    .limit(1);

  if (!song) return c.json({ error: 'Song not found' }, 404);
  return c.json(song);
});

// POST /api/bands/:bandId/songs
app.post('/', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', songSchema),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const body = c.req.valid('json');

    const [song] = await db.insert(songs).values({
      bandId,
      createdBy: userId,
      ...body,
      coverUrl: body.cover_url ?? null,
      spotifyUrl: body.spotify_url ?? null,
    }).returning();

    return c.json(song, 201);
  }
);

// PATCH /api/bands/:bandId/songs/:id
app.patch('/:id', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', songSchema.partial()),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const updates: Record<string, unknown> = {
      lastUpdatedBy: userId,
      ...body,
    };
    if ('cover_url' in body) updates.coverUrl = body.cover_url;
    if ('spotify_url' in body) updates.spotifyUrl = body.spotify_url;

    const [song] = await db.update(songs)
      .set(updates)
      .where(and(eq(songs.id, id), eq(songs.bandId, bandId), isNull(songs.deletedAt)))
      .returning();

    if (!song) return c.json({ error: 'Song not found' }, 404);
    return c.json(song);
  }
);

// DELETE /api/bands/:bandId/songs/:id — soft delete
app.delete('/:id', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');
  const userId = c.get('userId');
  const id = c.req.param('id');

  await db.update(songs)
    .set({ deletedAt: new Date(), deletedBy: userId })
    .where(and(eq(songs.id, id), eq(songs.bandId, bandId)));

  return c.json({ success: true });
});

// GET /api/bands/:bandId/songs/:id/usage — which setlists use this song
app.get('/:id/usage', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const songId = c.req.param('id');

  const { setSongs, sets: setsTable, setlists } = await import('../db/schema.js');
  const usage = await db
    .select({ setlistName: setlists.name })
    .from(setSongs)
    .innerJoin(setsTable, eq(setSongs.setId, setsTable.id))
    .innerJoin(setlists, eq(setsTable.setlistId, setlists.id))
    .where(
      and(
        eq(setSongs.songId, songId),
        eq(setSongs.bandId, bandId),
        isNull(setSongs.deletedAt),
        isNull(setlists.deletedAt)
      )
    );

  const unique = [...new Map(usage.map(u => [u.setlistName, u])).values()];
  return c.json(unique);
});

export default app;
