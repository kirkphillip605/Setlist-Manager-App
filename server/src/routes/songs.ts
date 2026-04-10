import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { songs } from '../db/schema.js';
import { and, eq, isNull, ilike, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, type BandVariables } from '../middleware/band.js';
import { toSnakeCase, toSnakeCaseArray } from '../utils/caseTransform.js';

const app = new Hono<{ Variables: BandVariables }>();

const emptyToNull = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
  z.string().url().nullable().optional()
);

const songSchema = z.object({
  title:      z.string().min(1).max(200),
  artist:     z.string().min(1).max(200),
  lyrics:     z.string().default(''),
  key:        z.string().max(20).default(''),
  tempo:      z.string().max(50).default(''),
  duration:   z.string().max(20).default(''),
  note:       z.string().max(2000).default(''),
  cover_url:  emptyToNull,
  spotify_url: emptyToNull,
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

  return c.json(toSnakeCaseArray(rows));
});

// GET /api/bands/:bandId/songs/:id
app.get('/:id', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const id = c.req.param('id');

  const [song] = await db.select().from(songs)
    .where(and(eq(songs.id, id), eq(songs.bandId, bandId), isNull(songs.deletedAt)))
    .limit(1);

  if (!song) return c.json({ error: 'Song not found' }, 404);
  return c.json(toSnakeCase(song));
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
      title: body.title,
      artist: body.artist,
      lyrics: body.lyrics,
      key: body.key,
      tempo: body.tempo,
      duration: body.duration,
      note: body.note,
      coverUrl: body.cover_url ?? null,
      spotifyUrl: body.spotify_url ?? null,
      isRetired: body.is_retired ?? false,
    }).returning();

    return c.json(toSnakeCase(song), 201);
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

    const updates: Record<string, unknown> = { lastUpdatedBy: userId };
    if (body.title !== undefined)       updates.title = body.title;
    if (body.artist !== undefined)      updates.artist = body.artist;
    if (body.lyrics !== undefined)      updates.lyrics = body.lyrics;
    if (body.key !== undefined)         updates.key = body.key;
    if (body.tempo !== undefined)       updates.tempo = body.tempo;
    if (body.duration !== undefined)    updates.duration = body.duration;
    if (body.note !== undefined)        updates.note = body.note;
    if ('cover_url' in body)            updates.coverUrl = body.cover_url;
    if ('spotify_url' in body)          updates.spotifyUrl = body.spotify_url;
    if (body.is_retired !== undefined)  updates.isRetired = body.is_retired;

    const [song] = await db.update(songs)
      .set(updates)
      .where(and(eq(songs.id, id), eq(songs.bandId, bandId), isNull(songs.deletedAt)))
      .returning();

    if (!song) return c.json({ error: 'Song not found' }, 404);
    return c.json(toSnakeCase(song));
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
  return c.json(toSnakeCaseArray(unique));
});

export default app;
