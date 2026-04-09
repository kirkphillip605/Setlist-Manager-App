import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';
import { bandMemberships } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import type { AuthVariables } from './auth.js';

export type BandVariables = AuthVariables & {
  bandId: string;
  bandRole: string;
  isApproved: boolean;
};

// Resolves bandId from route param and verifies the user is an active approved member
export const requireBandMember = createMiddleware<{ Variables: BandVariables }>(async (c, next) => {
  const userId = c.get('userId');
  const bandId = c.req.param('bandId');

  if (!bandId) {
    return c.json({ error: 'bandId param required' }, 400);
  }

  const platformRole = c.get('platformRole');
  const isPlatformStaff = platformRole === 'platform_admin' || platformRole === 'platform_support';

  if (!isPlatformStaff) {
    const [membership] = await db
      .select()
      .from(bandMemberships)
      .where(
        and(
          eq(bandMemberships.bandId, bandId),
          eq(bandMemberships.userId, userId),
          isNull(bandMemberships.deletedAt)
        )
      )
      .limit(1);

    if (!membership) {
      return c.json({ error: 'Not a member of this band' }, 403);
    }
    if (!membership.isApproved) {
      return c.json({ error: 'Membership pending approval' }, 403);
    }

    c.set('bandId', bandId);
    c.set('bandRole', membership.role);
    c.set('isApproved', membership.isApproved);
  } else {
    c.set('bandId', bandId);
    c.set('bandRole', 'platform_staff');
    c.set('isApproved', true);
  }

  await next();
});

// Requires owner or manager role within the band
export const requireBandManager = createMiddleware<{ Variables: BandVariables }>(async (c, next) => {
  const role = c.get('bandRole');
  if (role !== 'owner' && role !== 'manager' && role !== 'platform_staff' && role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: band manager or owner required' }, 403);
  }
  await next();
});

// Requires band owner role
export const requireBandOwner = createMiddleware<{ Variables: BandVariables }>(async (c, next) => {
  const role = c.get('bandRole');
  const platformRole = c.get('platformRole');
  if (role !== 'owner' && platformRole !== 'platform_admin') {
    return c.json({ error: 'Forbidden: band owner required' }, 403);
  }
  await next();
});
