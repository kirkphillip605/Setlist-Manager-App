import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { bands, bandMemberships, bandBans, users } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, requireBandOwner, type BandVariables } from '../middleware/band.js';

const app = new Hono<{ Variables: BandVariables }>();

// --- GET /api/bands — list bands the user belongs to
app.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');

  const memberships = await db
    .select({
      membership: bandMemberships,
      band: bands,
    })
    .from(bandMemberships)
    .innerJoin(bands, eq(bandMemberships.bandId, bands.id))
    .where(
      and(
        eq(bandMemberships.userId, userId),
        isNull(bandMemberships.deletedAt),
        isNull(bands.deletedAt)
      )
    );

  return c.json(memberships.map(r => ({
    ...r.band,
    membership: r.membership,
  })));
});

// --- POST /api/bands — create a new band
app.post('/', requireAuth,
  zValidator('json', z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  })),
  async (c) => {
    const userId = c.get('userId');
    const { name, description } = c.req.valid('json');

    const [band] = await db.insert(bands).values({
      name,
      description: description ?? null,
      joinCode: '',  // trigger will set this
      createdBy: userId,
    }).returning();

    // Owner membership
    await db.insert(bandMemberships).values({
      bandId: band.id,
      userId,
      role: 'owner',
      isApproved: true,
      joinedAt: new Date(),
    });

    return c.json(band, 201);
  }
);

// --- POST /api/bands/join — join a band via join code
app.post('/join', requireAuth,
  zValidator('json', z.object({ joinCode: z.string().length(6) })),
  async (c) => {
    const userId = c.get('userId');
    const { joinCode } = c.req.valid('json');

    const [band] = await db.select().from(bands)
      .where(and(eq(bands.joinCode, joinCode.toUpperCase()), isNull(bands.deletedAt)))
      .limit(1);

    if (!band) return c.json({ error: 'Invalid join code' }, 404);

    // Check if banned
    const [ban] = await db.select().from(bandBans)
      .where(and(eq(bandBans.bandId, band.id), eq(bandBans.userId, userId)))
      .limit(1);
    if (ban) return c.json({ error: 'You have been banned from this band' }, 403);

    // Check existing membership
    const [existing] = await db.select().from(bandMemberships)
      .where(and(eq(bandMemberships.bandId, band.id), eq(bandMemberships.userId, userId)))
      .limit(1);

    if (existing && !existing.deletedAt) {
      return c.json({ band, membership: existing });
    }

    // Create or restore membership (pending approval)
    const [membership] = await db.insert(bandMemberships).values({
      bandId: band.id,
      userId,
      role: 'member',
      isApproved: false,
    }).onConflictDoUpdate({
      target: [bandMemberships.bandId, bandMemberships.userId],
      set: { deletedAt: null, isApproved: false, updatedAt: new Date() },
    }).returning();

    return c.json({ band, membership }, 201);
  }
);

// --- GET /api/bands/pending-requests — list user's pending join requests
app.get('/pending-requests', requireAuth, async (c) => {
  const userId = c.get('userId');

  const requests = await db
    .select({
      id:         bandMemberships.id,
      bandId:     bandMemberships.bandId,
      bandName:   bands.name,
      isApproved: bandMemberships.isApproved,
      createdAt:  bandMemberships.createdAt,
    })
    .from(bandMemberships)
    .innerJoin(bands, eq(bandMemberships.bandId, bands.id))
    .where(
      and(
        eq(bandMemberships.userId, userId),
        eq(bandMemberships.isApproved, false),
        isNull(bandMemberships.deletedAt),
        isNull(bands.deletedAt)
      )
    );

  return c.json(requests);
});

// ── Band-scoped routes (require membership) ──────────────────────────

// --- GET /api/bands/:bandId
app.get('/:bandId', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');
  const [band] = await db.select().from(bands)
    .where(and(eq(bands.id, bandId), isNull(bands.deletedAt)))
    .limit(1);
  if (!band) return c.json({ error: 'Band not found' }, 404);
  return c.json(band);
});

// --- PATCH /api/bands/:bandId — update band info (manager+)
app.patch('/:bandId', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const updates = c.req.valid('json');
    const [band] = await db.update(bands).set({ ...updates, updatedAt: new Date() })
      .where(eq(bands.id, bandId)).returning();
    return c.json(band);
  }
);

// --- GET /api/bands/:bandId/members/pending — list unapproved join requests
app.get('/:bandId/members/pending', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');

  const pending = await db
    .select({
      id:        bandMemberships.id,
      userId:    bandMemberships.userId,
      email:     users.email,
      firstName: users.firstName,
      lastName:  users.lastName,
    })
    .from(bandMemberships)
    .innerJoin(users, eq(bandMemberships.userId, users.id))
    .where(and(
      eq(bandMemberships.bandId, bandId),
      eq(bandMemberships.isApproved, false),
      isNull(bandMemberships.deletedAt)
    ));

  return c.json(pending.map(r => ({
    id:        r.id,
    userId:    r.userId,
    email:     r.email,
    firstName: r.firstName,
    lastName:  r.lastName,
  })));
});

// --- POST /api/bands/:bandId/members/:membershipId/approve — approve a join request
app.post('/:bandId/members/:membershipId/approve', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId       = c.get('bandId');
  const membershipId = c.req.param('membershipId');

  const [membership] = await db.update(bandMemberships)
    .set({ isApproved: true, joinedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bandMemberships.id, membershipId), eq(bandMemberships.bandId, bandId)))
    .returning();

  if (!membership) return c.json({ error: 'Membership not found' }, 404);
  return c.json(membership);
});

// --- POST /api/bands/:bandId/members/:membershipId/deny — deny / remove a join request
app.post('/:bandId/members/:membershipId/deny', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId       = c.get('bandId');
  const membershipId = c.req.param('membershipId');

  await db.update(bandMemberships)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bandMemberships.id, membershipId), eq(bandMemberships.bandId, bandId)));

  return c.json({ success: true });
});

// --- GET /api/bands/:bandId/members — list members
app.get('/:bandId/members', requireAuth, requireBandMember, async (c) => {
  const bandId = c.get('bandId');

  const members = await db
    .select({
      membership: bandMemberships,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        image: users.image,
      },
    })
    .from(bandMemberships)
    .innerJoin(users, eq(bandMemberships.userId, users.id))
    .where(and(eq(bandMemberships.bandId, bandId), isNull(bandMemberships.deletedAt)));

  return c.json(members.map(r => ({
    ...r.membership,
    user: r.user,
  })));
});

// --- PATCH /api/bands/:bandId/members/:userId — update a member
app.patch('/:bandId/members/:userId', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({
    role: z.enum(['manager', 'member']).optional(),
    position: z.string().max(100).nullable().optional(),
    is_approved: z.boolean().optional(),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const targetUserId = c.req.param('userId');
    const body = c.req.valid('json');

    const [target] = await db.select().from(bandMemberships)
      .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)))
      .limit(1);

    if (target?.role === 'owner') {
      return c.json({ error: 'Cannot modify the band owner' }, 403);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.role !== undefined) updates.role = body.role;
    if (body.position !== undefined) updates.position = body.position;
    if (body.is_approved !== undefined) {
      updates.isApproved = body.is_approved;
      if (body.is_approved) updates.joinedAt = new Date();
    }

    const [membership] = await db.update(bandMemberships)
      .set(updates)
      .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)))
      .returning();

    return c.json(membership);
  }
);

// --- DELETE /api/bands/:bandId/members/:userId — remove a member
app.delete('/:bandId/members/:userId', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');
  const targetUserId = c.req.param('userId');
  const actorRole = c.get('bandRole');

  // Owners can only be removed by platform admins
  const [target] = await db.select().from(bandMemberships)
    .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)))
    .limit(1);

  if (target?.role === 'owner' && actorRole !== 'platform_staff') {
    return c.json({ error: 'Cannot remove band owner' }, 403);
  }

  await db.update(bandMemberships)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)));

  return c.json({ success: true });
});

// --- POST /api/bands/:bandId/bans — ban a user
app.post('/:bandId/bans', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({ userId: z.string(), reason: z.string().optional() })),
  async (c) => {
    const bandId = c.get('bandId');
    const actorId = c.get('userId');
    const { userId: targetUserId, reason } = c.req.valid('json');

    const [target] = await db.select().from(bandMemberships)
      .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)))
      .limit(1);

    if (target?.role === 'owner') {
      return c.json({ error: 'Cannot ban the band owner' }, 403);
    }

    // Remove membership first
    await db.update(bandMemberships)
      .set({ deletedAt: new Date() })
      .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)));

    const [ban] = await db.insert(bandBans).values({
      bandId, userId: targetUserId, bannedBy: actorId, reason: reason ?? null,
    }).returning();

    return c.json(ban, 201);
  }
);

// --- DELETE /api/bands/:bandId/bans/:userId — unban a user
app.delete('/:bandId/bans/:userId', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');
  const targetUserId = c.req.param('userId');

  await db.delete(bandBans)
    .where(and(eq(bandBans.bandId, bandId), eq(bandBans.userId, targetUserId)));

  return c.json({ success: true });
});

// --- POST /api/bands/:bandId/regenerate-code — regenerate join code (manager+)
app.post('/:bandId/regenerate-code', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');

  // Set joinCode to empty so the trigger regenerates it
  const [band] = await db.update(bands)
    .set({ joinCode: '', updatedAt: new Date() })
    .where(eq(bands.id, bandId))
    .returning();

  return c.json(band);
});

// --- GET /api/bands/:bandId/bans — list banned users
app.get('/:bandId/bans', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');

  const banned = await db
    .select({
      ban: bandBans,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(bandBans)
    .innerJoin(users, eq(bandBans.userId, users.id))
    .where(eq(bandBans.bandId, bandId));

  return c.json(banned.map(r => ({
    ...r.ban,
    user: r.user,
  })));
});

// --- POST /api/bands/:bandId/transfer-ownership — transfer band ownership
app.post('/:bandId/transfer-ownership', requireAuth, requireBandMember, requireBandOwner,
  zValidator('json', z.object({
    targetUserId: z.string(),
    leaveAfterTransfer: z.boolean().default(false),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const currentOwnerId = c.get('userId');
    const { targetUserId, leaveAfterTransfer } = c.req.valid('json');

    if (currentOwnerId === targetUserId) {
      return c.json({ error: 'Cannot transfer ownership to yourself' }, 400);
    }

    const [targetMembership] = await db.select().from(bandMemberships)
      .where(and(
        eq(bandMemberships.bandId, bandId),
        eq(bandMemberships.userId, targetUserId),
        isNull(bandMemberships.deletedAt)
      ))
      .limit(1);

    if (!targetMembership || !targetMembership.isApproved) {
      return c.json({ error: 'Target user is not an active member' }, 400);
    }

    await db.transaction(async (tx) => {
      await tx.update(bandMemberships)
        .set({ role: 'owner', updatedAt: new Date() })
        .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, targetUserId)));

      if (leaveAfterTransfer) {
        await tx.update(bandMemberships)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, currentOwnerId)));
      } else {
        await tx.update(bandMemberships)
          .set({ role: 'member', updatedAt: new Date() })
          .where(and(eq(bandMemberships.bandId, bandId), eq(bandMemberships.userId, currentOwnerId)));
      }
    });

    return c.json({ success: true });
  }
);

// --- POST /api/bands/:bandId/delete — soft-delete band (owner only, requires OTP)
app.post('/:bandId/delete', requireAuth, requireBandMember, requireBandOwner,
  zValidator('json', z.object({
    otp: z.string().min(1),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const ownerId = c.get('userId');
    const { otp } = c.req.valid('json');

    const [owner] = await db.select().from(users)
      .where(eq(users.id, ownerId))
      .limit(1);

    if (!owner?.email) {
      return c.json({ error: 'No email associated with your account' }, 400);
    }

    const { auth } = await import('../auth.js');
    const ctx = { headers: c.req.raw.headers };
    let otpValid = false;
    try {
      const result = await auth.api.verifyEmailOTP({ body: { email: owner.email, otp }, headers: ctx.headers });
      otpValid = !!result;
    } catch {
      otpValid = false;
    }

    if (!otpValid) {
      return c.json({ error: 'Invalid or expired verification code' }, 400);
    }

    await db.update(bands)
      .set({ deletedAt: new Date(), deletedBy: ownerId, updatedAt: new Date() })
      .where(eq(bands.id, bandId));

    await db.update(bandMemberships)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bandMemberships.bandId, bandId), isNull(bandMemberships.deletedAt)));

    return c.json({ success: true });
  }
);

// --- POST /api/bands/:bandId/request-delete-otp — send OTP for band deletion
app.post('/:bandId/request-delete-otp', requireAuth, requireBandMember, requireBandOwner, async (c) => {
  const ownerId = c.get('userId');

  const [owner] = await db.select().from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  if (!owner?.email) {
    return c.json({ error: 'No email associated with your account' }, 400);
  }

  const { auth } = await import('../auth.js');
  await auth.api.sendVerificationOTP({ body: { email: owner.email, type: 'email-verification' } });

  return c.json({ success: true, email: owner.email });
});

export default app;
