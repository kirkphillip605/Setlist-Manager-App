import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, bandMemberships, bands } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuth, requirePlatformAdmin, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

// ── Self ──────────────────────────────────────────────────────────

// GET /api/users/me — current user profile + band memberships
app.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId');

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const memberships = await db
    .select({ membership: bandMemberships, band: bands })
    .from(bandMemberships)
    .innerJoin(bands, eq(bandMemberships.bandId, bands.id))
    .where(and(eq(bandMemberships.userId, userId), isNull(bandMemberships.deletedAt), isNull(bands.deletedAt)));

  return c.json({
    id:            user.id,
    email:         user.email,
    first_name:    user.firstName,
    last_name:     user.lastName,
    avatar_url:    user.image,
    platform_role: user.platformRole,
    is_active:     user.isActive,
    preferences:   user.preferences,
    bands: memberships.map(r => ({ ...r.band, membership: r.membership })),
  });
});

// PATCH /api/users/me — update own profile
app.patch('/me', requireAuth,
  zValidator('json', z.object({
    first_name:  z.string().max(100).optional(),
    last_name:   z.string().max(100).optional(),
    preferences: z.record(z.unknown()).optional(),
  })),
  async (c) => {
    const userId = c.get('userId');
    const body   = c.req.valid('json');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.first_name  !== undefined) updates.firstName   = body.first_name;
    if (body.last_name   !== undefined) updates.lastName    = body.last_name;
    if (body.preferences !== undefined) updates.preferences = body.preferences;

    const [user] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return c.json({
      id:            user.id,
      email:         user.email,
      first_name:    user.firstName,
      last_name:     user.lastName,
      avatar_url:    user.image,
      platform_role: user.platformRole,
      is_active:     user.isActive,
      preferences:   user.preferences,
    });
  }
);

// DELETE /api/users/me — soft-deactivate own account
app.delete('/me', requireAuth, async (c) => {
  const userId = c.get('userId');
  await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
  return c.json({ success: true });
});

// POST /api/users/me/reactivate — re-activate own account (must be signed in)
app.post('/me/reactivate', requireAuth, async (c) => {
  const userId = c.get('userId');
  const [user] = await db.update(users)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return c.json({
    id:            user.id,
    email:         user.email,
    first_name:    user.firstName,
    last_name:     user.lastName,
    is_active:     user.isActive,
    platform_role: user.platformRole,
  });
});

// GET /api/users/:id/public — public profile (requires auth, returns safe subset)
app.get('/:id/public', requireAuth, async (c) => {
  const id = c.req.param('id');
  const [user] = await db.select({
    id:         users.id,
    firstName:  users.firstName,
    lastName:   users.lastName,
    avatarUrl:  users.image,
  }).from(users).where(eq(users.id, id)).limit(1);

  if (!user) return c.json({ error: 'Not found' }, 404);
  return c.json({
    id:         user.id,
    first_name: user.firstName,
    last_name:  user.lastName,
    avatar_url: user.avatarUrl,
  });
});

// ── Platform admin routes ─────────────────────────────────────────

// GET /api/users — list all users (admin only)
app.get('/', requireAuth, requirePlatformAdmin, async (c) => {
  const rows = await db.select({
    id:           users.id,
    email:        users.email,
    firstName:    users.firstName,
    lastName:     users.lastName,
    platformRole: users.platformRole,
    isActive:     users.isActive,
    createdAt:    users.createdAt,
  }).from(users);
  return c.json(rows);
});

// PATCH /api/users/:id — update any user (admin only)
app.patch('/:id', requireAuth, requirePlatformAdmin,
  zValidator('json', z.object({
    platform_role: z.enum(['user', 'platform_admin', 'platform_support']).optional(),
    is_active:     z.boolean().optional(),
  })),
  async (c) => {
    const id   = c.req.param('id');
    const body = c.req.valid('json');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.platform_role !== undefined) updates.platformRole = body.platform_role;
    if (body.is_active     !== undefined) updates.isActive     = body.is_active;

    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return c.json(user);
  }
);

export default app;
