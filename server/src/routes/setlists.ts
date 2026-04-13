import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { setlists, sets, setSongs, songs, gigs, gigSessions } from '../db/schema.js';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { requireBandMember, type BandVariables } from '../middleware/band.js';
import { toSnakeCase, toSnakeCaseArray } from '../utils/caseTransform.js';

const app = new Hono<{ Variables: BandVariables }>();

// GET /api/bands/:bandId/setlists
app.get('/', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');

  const rows = await db.select().from(setlists)
    .where(and(eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
    .orderBy(setlists.name);

  // Hydrate sets and set_songs for each setlist
  const setlistIds = rows.map(s => s.id);
  if (setlistIds.length === 0) return c.json([]);

  const allSets = await db.select().from(sets)
    .where(and(inArray(sets.setlistId, setlistIds), isNull(sets.deletedAt)))
    .orderBy(sets.position);

  const setIds = allSets.map(s => s.id);
  const allSetSongs = setIds.length > 0
    ? await db.select({ ss: setSongs, song: songs })
        .from(setSongs)
        .innerJoin(songs, eq(setSongs.songId, songs.id))
        .where(and(inArray(setSongs.setId, setIds), isNull(setSongs.deletedAt)))
        .orderBy(setSongs.position)
    : [];

  const setMap = new Map<string, (typeof allSets[0] & { songs: typeof allSetSongs })>();
  for (const s of allSets) setMap.set(s.id, { ...s, songs: [] });
  for (const { ss, song } of allSetSongs) {
    setMap.get(ss.setId)?.songs.push({ ...ss, song } as any);
  }

  const result = rows.map(sl => ({
    ...sl,
    sets: allSets
      .filter(s => s.setlistId === sl.id)
      .map(s => ({ ...setMap.get(s.id)! })),
  }));

  return c.json(toSnakeCaseArray(result));
});

// GET /api/bands/:bandId/setlists/:id
app.get('/:id', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const id = c.req.param('id');

  const [sl] = await db.select().from(setlists)
    .where(and(eq(setlists.id, id), eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
    .limit(1);

  if (!sl) return c.json({ error: 'Setlist not found' }, 404);

  const allSets = await db.select().from(sets)
    .where(and(eq(sets.setlistId, id), isNull(sets.deletedAt)))
    .orderBy(sets.position);

  const setIds = allSets.map(s => s.id);
  const allSetSongs = setIds.length > 0
    ? await db.select({ ss: setSongs, song: songs })
        .from(setSongs)
        .innerJoin(songs, eq(setSongs.songId, songs.id))
        .where(and(inArray(setSongs.setId, setIds), isNull(setSongs.deletedAt)))
        .orderBy(setSongs.position)
    : [];

  const setMap = new Map<string, any>();
  for (const s of allSets) setMap.set(s.id, { ...s, songs: [] });
  for (const { ss, song } of allSetSongs) {
    setMap.get(ss.setId)?.songs.push({ ...ss, song });
  }

  return c.json(toSnakeCase({ ...sl, sets: allSets.map(s => setMap.get(s.id)!) }));
});

// POST /api/bands/:bandId/setlists
app.post('/', requireAuth, requireBandMember,
  zValidator('json', z.object({
    name:        z.string().min(1).max(200),
    is_personal: z.boolean().default(false),
    is_default:  z.boolean().default(false),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const { name, is_personal, is_default } = c.req.valid('json');
    const role = c.get('bandRole');
    const isManagerOrAbove = role === 'owner' || role === 'manager' || role === 'platform_staff' || role === 'platform_admin';
    if (!is_personal && !isManagerOrAbove) {
      return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
    }
    if (is_default && !isManagerOrAbove) {
      return c.json({ error: 'Forbidden: only managers can set a default setlist' }, 403);
    }

    if (is_default) {
      await db.update(setlists).set({ isDefault: false })
        .where(and(eq(setlists.bandId, bandId), isNull(setlists.deletedAt)));
    }

    const [sl] = await db.insert(setlists).values({
      bandId, name, isPersonal: is_personal, isDefault: is_default, createdBy: userId,
    }).returning();

    return c.json(toSnakeCase({ ...sl, sets: [] }), 201);
  }
);

// PATCH /api/bands/:bandId/setlists/:id
app.patch('/:id', requireAuth, requireBandMember,
  zValidator('json', z.object({
    name:        z.string().min(1).max(200).optional(),
    is_personal: z.boolean().optional(),
    is_default:  z.boolean().optional(),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db.select().from(setlists)
      .where(and(eq(setlists.id, id), eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
      .limit(1);
    if (!existing) return c.json({ error: 'Setlist not found' }, 404);

    const role = c.get('bandRole');
    const isManagerOrAbove = role === 'owner' || role === 'manager' || role === 'platform_staff' || role === 'platform_admin';
    const isOwnPersonal = existing.isPersonal && existing.createdBy === userId;
    if (!isManagerOrAbove && !isOwnPersonal) {
      return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
    }
    if (!isManagerOrAbove) {
      if (body.is_personal === false) {
        return c.json({ error: 'Forbidden: only managers can convert a personal setlist to band setlist' }, 403);
      }
      if (body.is_default) {
        return c.json({ error: 'Forbidden: only managers can set a default setlist' }, 403);
      }
    }

    // Check for active sessions on this setlist
    const gigsUsingSetlist = await db.select({ id: gigs.id }).from(gigs)
      .where(and(eq(gigs.setlistId, id), isNull(gigs.deletedAt)));

    if (gigsUsingSetlist.length > 0) {
      const gigIds = gigsUsingSetlist.map(g => g.id);
      const [activeSession] = await db.select({ id: gigSessions.id }).from(gigSessions)
        .where(and(inArray(gigSessions.gigId, gigIds), eq(gigSessions.isActive, true)))
        .limit(1);
      if (activeSession) {
        return c.json({ error: 'Cannot edit setlist while it is being used in an active performance' }, 409);
      }
    }

    if (body.is_default) {
      await db.update(setlists).set({ isDefault: false })
        .where(and(eq(setlists.bandId, bandId), isNull(setlists.deletedAt)));
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_personal !== undefined) updates.isPersonal = body.is_personal;
    if (body.is_default !== undefined) updates.isDefault = body.is_default;

    const [sl] = await db.update(setlists).set(updates)
      .where(and(eq(setlists.id, id), eq(setlists.bandId, bandId)))
      .returning();

    return c.json(toSnakeCase(sl));
  }
);

// DELETE /api/bands/:bandId/setlists/:id
app.delete('/:id', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [existing] = await db.select().from(setlists)
    .where(and(eq(setlists.id, id), eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
    .limit(1);
  if (!existing) return c.json({ error: 'Setlist not found' }, 404);

  const role = c.get('bandRole');
  const isManagerOrAbove = role === 'owner' || role === 'manager' || role === 'platform_staff' || role === 'platform_admin';
  const isOwnPersonal = existing.isPersonal && existing.createdBy === userId;
  if (!isManagerOrAbove && !isOwnPersonal) {
    return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
  }

  await db.update(setlists)
    .set({ deletedAt: new Date(), deletedBy: userId })
    .where(and(eq(setlists.id, id), eq(setlists.bandId, bandId)));

  return c.json({ success: true });
});

// GET /api/bands/:bandId/setlists/:id/usage — gigs using this setlist
app.get('/:id/usage', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const id = c.req.param('id');

  const rows = await db.select().from(gigs)
    .where(and(eq(gigs.setlistId, id), eq(gigs.bandId, bandId), isNull(gigs.deletedAt)));

  return c.json(toSnakeCaseArray(rows));
});

// POST /api/bands/:bandId/setlists/:id/sync — full setlist sync (editor save)
app.post('/:id/sync', requireAuth, requireBandMember,
  zValidator('json', z.object({
    name: z.string().min(1).max(200).optional(),
    sets: z.array(z.object({
      id:       z.string(),
      name:     z.string(),
      position: z.number(),
      songs: z.array(z.object({
        id:       z.string(),
        position: z.number(),
        songId:   z.string(),
      })),
    })),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const setlistId = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db.select().from(setlists)
      .where(and(eq(setlists.id, setlistId), eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
      .limit(1);
    if (!existing) return c.json({ error: 'Setlist not found' }, 404);

    const role = c.get('bandRole');
    const isManagerOrAbove = role === 'owner' || role === 'manager' || role === 'platform_staff' || role === 'platform_admin';
    const isOwnPersonal = existing.isPersonal && existing.createdBy === userId;
    if (!isManagerOrAbove && !isOwnPersonal) {
      return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
    }

    // Check for active sessions
    const gigsUsing = await db.select({ id: gigs.id }).from(gigs)
      .where(and(eq(gigs.setlistId, setlistId), isNull(gigs.deletedAt)));

    if (gigsUsing.length > 0) {
      const [active] = await db.select({ id: gigSessions.id }).from(gigSessions)
        .where(and(inArray(gigSessions.gigId, gigsUsing.map(g => g.id)), eq(gigSessions.isActive, true)))
        .limit(1);
      if (active) {
        return c.json({ error: 'Cannot edit setlist while it is being used in an active performance' }, 409);
      }
    }

    if (body.name) {
      await db.update(setlists).set({ name: body.name, lastUpdatedBy: userId })
        .where(eq(setlists.id, setlistId));
    }

    // Soft-delete sets not in the incoming payload
    const existingSets = await db.select({ id: sets.id }).from(sets)
      .where(and(eq(sets.setlistId, setlistId), isNull(sets.deletedAt)));

    const incomingSetIds = new Set(body.sets.filter(s => !s.id.startsWith('temp-')).map(s => s.id));
    const toDeleteSets = existingSets.filter(s => !incomingSetIds.has(s.id)).map(s => s.id);

    if (toDeleteSets.length > 0) {
      await db.update(sets).set({ deletedAt: new Date(), deletedBy: userId })
        .where(inArray(sets.id, toDeleteSets));
    }

    const tempSetIdMap: Record<string, string> = {};

    for (const set of body.sets) {
      if (set.id.startsWith('temp-')) {
        const [newSet] = await db.insert(sets).values({
          bandId, setlistId, name: set.name, position: set.position, createdBy: userId,
        }).returning();
        tempSetIdMap[set.id] = newSet.id;
      } else {
        await db.update(sets).set({ name: set.name, position: set.position })
          .where(and(eq(sets.id, set.id), eq(sets.bandId, bandId)));
      }
    }

    for (const set of body.sets) {
      const realSetId = set.id.startsWith('temp-') ? tempSetIdMap[set.id] : set.id;

      const existingSS = await db.select({ id: setSongs.id }).from(setSongs)
        .where(and(eq(setSongs.setId, realSetId), isNull(setSongs.deletedAt)));

      const incomingSSIds = new Set(set.songs.filter(s => !s.id.startsWith('temp-')).map(s => s.id));
      const toDeleteSS = existingSS.filter(s => !incomingSSIds.has(s.id)).map(s => s.id);

      if (toDeleteSS.length > 0) {
        await db.update(setSongs).set({ deletedAt: new Date(), deletedBy: userId })
          .where(inArray(setSongs.id, toDeleteSS));
      }

      for (const ss of set.songs) {
        if (ss.id.startsWith('temp-')) {
          await db.insert(setSongs).values({
            bandId, setId: realSetId, songId: ss.songId, position: ss.position, createdBy: userId,
          });
        } else {
          await db.update(setSongs).set({ position: ss.position + 10000 })
            .where(eq(setSongs.id, ss.id));
        }
      }
      for (const ss of set.songs) {
        if (!ss.id.startsWith('temp-')) {
          await db.update(setSongs).set({ position: ss.position, setId: realSetId })
            .where(eq(setSongs.id, ss.id));
        }
      }
    }

    return c.json({ success: true });
  }
);

// POST /api/bands/:bandId/setlists/:id/clone
app.post('/:id/clone', requireAuth, requireBandMember,
  zValidator('json', z.object({
    name:        z.string().min(1).max(200),
    is_personal: z.boolean().default(false),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const userId = c.get('userId');
    const sourceId = c.req.param('id');
    const { name, is_personal } = c.req.valid('json');

    const role = c.get('bandRole');
    const isManagerOrAbove = role === 'owner' || role === 'manager' || role === 'platform_staff' || role === 'platform_admin';
    if (!is_personal && !isManagerOrAbove) {
      return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
    }

    const [source] = await db.select().from(setlists)
      .where(and(eq(setlists.id, sourceId), eq(setlists.bandId, bandId), isNull(setlists.deletedAt)))
      .limit(1);

    if (!source) return c.json({ error: 'Setlist not found' }, 404);

    const [newSl] = await db.insert(setlists).values({
      bandId, name, isPersonal: is_personal, isDefault: false, createdBy: userId,
    }).returning();

    const sourceSets = await db.select().from(sets)
      .where(and(eq(sets.setlistId, sourceId), isNull(sets.deletedAt)))
      .orderBy(sets.position);

    for (const sourceSet of sourceSets) {
      const [newSet] = await db.insert(sets).values({
        bandId, setlistId: newSl.id, name: sourceSet.name, position: sourceSet.position, createdBy: userId,
      }).returning();

      const sourceSS = await db.select().from(setSongs)
        .where(and(eq(setSongs.setId, sourceSet.id), isNull(setSongs.deletedAt)))
        .orderBy(setSongs.position);

      for (const ss of sourceSS) {
        await db.insert(setSongs).values({
          bandId, setId: newSet.id, songId: ss.songId, position: ss.position, createdBy: userId,
        });
      }
    }

    return c.json({ id: newSl.id }, 201);
  }
);

export default app;
