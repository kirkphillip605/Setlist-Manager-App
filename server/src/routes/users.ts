import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, accounts, bandMemberships, bands } from '../db/schema.js';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { requireAuth, requirePlatformAdmin, type AuthVariables } from '../middleware/auth.js';
import { sendPhoneReassignmentEmail } from '../lib/email.js';

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
    id:                  user.id,
    email:               user.email,
    first_name:          user.firstName,
    last_name:           user.lastName,
    avatar_url:          user.image,
    platform_role:       user.platformRole,
    is_active:           user.isActive,
    is_profile_complete: user.isProfileComplete,
    preferences:         user.preferences,
    bands: memberships.map(r => ({ ...r.band, membership: r.membership })),
  });
});

app.get('/me/auth-providers', requireAuth, async (c) => {
  const userId = c.get('userId');
  const userAccounts = await db.select({
    providerId: accounts.providerId,
  }).from(accounts).where(eq(accounts.userId, userId));

  const providers = userAccounts.map(a => a.providerId);
  const hasPassword = providers.includes('credential');
  const hasOAuth = providers.some(p => p !== 'credential' && p !== 'email-otp');

  return c.json({ providers, hasPassword, hasOAuth });
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

    const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const finalFirstName = (body.first_name ?? current?.firstName) || null;
    const finalLastName  = (body.last_name  ?? current?.lastName)  || null;
    if (finalFirstName && finalLastName && !current?.isProfileComplete) {
      updates.isProfileComplete = true;
    }

    const [user] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return c.json({
      id:                  user.id,
      email:               user.email,
      first_name:          user.firstName,
      last_name:           user.lastName,
      avatar_url:          user.image,
      platform_role:       user.platformRole,
      is_active:           user.isActive,
      is_profile_complete: user.isProfileComplete,
      preferences:         user.preferences,
    });
  }
);

// POST /api/users/me/reassign-phone — reassign verified phone number from another user
// This should only be called AFTER the phone has been verified via BetterAuth's phone OTP flow.
// The caller must pass the verified phone number; the server checks that the current user
// already has this phone marked as verified (set by BetterAuth's phoneNumber plugin),
// then handles reassignment from any previous owner.
app.post('/me/reassign-phone', requireAuth,
  zValidator('json', z.object({
    phone: z.string().min(1),
  })),
  async (c) => {
    const userId = c.get('userId');
    const { phone } = c.req.valid('json');

    const [currentUser] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!currentUser || currentUser.phone !== phone || !currentUser.phoneVerified) {
      return c.json({ error: 'Phone number must be verified via OTP before reassignment' }, 400);
    }

    const [existingUser] = await db.select()
      .from(users)
      .where(and(eq(users.phone, phone), ne(users.id, userId)))
      .limit(1);

    if (existingUser) {
      await db.update(users)
        .set({ phone: null, phoneVerified: false, updatedAt: new Date() })
        .where(eq(users.id, existingUser.id));

      try {
        if (existingUser.email) {
          await sendPhoneReassignmentEmail(existingUser.email, phone, existingUser.firstName ?? undefined);
        }
      } catch (err) {
        console.error('[Users] Failed to send phone reassignment notification:', err);
      }
    }

    return c.json({
      id:            currentUser.id,
      phone:         currentUser.phone,
      phoneVerified: currentUser.phoneVerified,
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
