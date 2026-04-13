import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { bandInvitations, bands, bandMemberships, users } from '../db/schema.js';
import { and, eq, or, isNull, inArray } from 'drizzle-orm';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';
import { requireBandMember, requireBandManager, type BandVariables } from '../middleware/band.js';
import { sendEmail } from '../lib/email.js';
import { sendSMS } from '../lib/sms.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://setlist.kirknet.io';

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '');
}

const bandScoped = new Hono<{ Variables: BandVariables }>();

bandScoped.post('/', requireAuth, requireBandMember, requireBandManager,
  zValidator('json', z.object({
    invites: z.array(z.object({
      email: z.string().email().optional(),
      phone: z.string().min(7).optional(),
    }).refine(d => d.email || d.phone, { message: 'email or phone required' })).min(1).max(20),
  })),
  async (c) => {
    const bandId = c.get('bandId');
    const invitedBy = c.get('userId');
    const { invites } = c.req.valid('json');

    const [band] = await db.select().from(bands)
      .where(and(eq(bands.id, bandId), isNull(bands.deletedAt)))
      .limit(1);
    if (!band) return c.json({ error: 'Band not found' }, 404);

    const [inviter] = await db.select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).where(eq(users.id, invitedBy)).limit(1);

    const inviterName = inviter
      ? `${inviter.firstName ?? ''} ${inviter.lastName ?? ''}`.trim() || inviter.email
      : 'A band member';

    const results: Array<{ email?: string; phone?: string; status: string; id?: string }> = [];

    for (const invite of invites) {
      const email = invite.email?.toLowerCase();
      const phone = invite.phone ? normalizePhone(invite.phone) : undefined;

      const existing = await db.select().from(bandInvitations)
        .where(and(
          eq(bandInvitations.bandId, bandId),
          eq(bandInvitations.status, 'pending'),
          email
            ? eq(bandInvitations.invitedEmail, email)
            : eq(bandInvitations.invitedPhone, phone!),
        ))
        .limit(1);

      if (existing.length > 0) {
        results.push({ email, phone, status: 'already_invited', id: existing[0].id });
        continue;
      }

      if (email) {
        const [existingMember] = await db
          .select({ userId: users.id })
          .from(users)
          .innerJoin(bandMemberships, and(
            eq(bandMemberships.userId, users.id),
            eq(bandMemberships.bandId, bandId),
            isNull(bandMemberships.deletedAt),
          ))
          .where(eq(users.email, email))
          .limit(1);

        if (existingMember) {
          results.push({ email, status: 'already_member' });
          continue;
        }
      }

      const [invitation] = await db.insert(bandInvitations).values({
        bandId,
        invitedEmail: email ?? null,
        invitedPhone: phone ?? null,
        invitedBy,
        status: 'pending',
        joinCodeSnapshot: band.joinCode,
      }).returning();

      if (email) {
        const [existingUser] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUser) {
          results.push({ email, status: 'invited_existing_user', id: invitation.id });
        } else {
          const registrationLink = `${FRONTEND_URL}/login?joinCode=${band.joinCode}`;
          try {
            await sendEmail({
              to: email,
              subject: `You're invited to join ${band.name} on SetlistPRO`,
              textBody: `${inviterName} has invited you to join "${band.name}" on SetlistPRO.\n\nClick here to sign up and join: ${registrationLink}\n\nOr use join code: ${band.joinCode}\n\nIf you already have an account, log in and use the join code above.`,
              htmlBody: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                  <h2 style="color:#1a1a1a">You're Invited!</h2>
                  <p><strong>${inviterName}</strong> has invited you to join <strong>${band.name}</strong> on SetlistPRO.</p>
                  <p style="text-align:center;margin:32px 0">
                    <a href="${registrationLink}" style="background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">
                      Accept Invitation
                    </a>
                  </p>
                  <p style="color:#666;font-size:13px">Or use this join code: <strong style="font-size:16px;letter-spacing:2px">${band.joinCode}</strong></p>
                  <p style="color:#666;font-size:13px">If you already have an account, simply log in and use the join code above.</p>
                </div>`,
            });
          } catch (err) {
            console.error('[Invitations] Failed to send email:', err);
          }
          results.push({ email, status: 'invited_new_user', id: invitation.id });
        }
      } else if (phone) {
        const smsLink = `${FRONTEND_URL}/login?joinCode=${band.joinCode}`;
        try {
          await sendSMS(
            phone,
            `${inviterName} with ${band.name} has invited you to join them on SetlistPRO. Click ${smsLink} to accept the invitation.`
          );
        } catch (err) {
          console.error('[Invitations] Failed to send SMS:', err);
        }
        results.push({ phone, status: 'invited', id: invitation.id });
      }
    }

    return c.json({ results }, 201);
  }
);

bandScoped.get('/', requireAuth, requireBandMember, requireBandManager, async (c) => {
  const bandId = c.get('bandId');

  const invitations = await db
    .select({
      invitation: bandInvitations,
      inviterFirstName: users.firstName,
      inviterLastName: users.lastName,
    })
    .from(bandInvitations)
    .innerJoin(users, eq(bandInvitations.invitedBy, users.id))
    .where(eq(bandInvitations.bandId, bandId))
    .orderBy(bandInvitations.createdAt);

  return c.json(invitations.map(r => ({
    id: r.invitation.id,
    band_id: r.invitation.bandId,
    invited_email: r.invitation.invitedEmail,
    invited_phone: r.invitation.invitedPhone,
    invited_by: r.invitation.invitedBy,
    inviter_name: `${r.inviterFirstName ?? ''} ${r.inviterLastName ?? ''}`.trim(),
    status: r.invitation.status,
    join_code_snapshot: r.invitation.joinCodeSnapshot,
    created_at: r.invitation.createdAt,
    updated_at: r.invitation.updatedAt,
  })));
});

const userScoped = new Hono<{ Variables: AuthVariables }>();

userScoped.get('/mine', requireAuth, async (c) => {
  const userId = c.get('userId');

  const [currentUser] = await db.select({
    email: users.email,
    phone: users.phone,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!currentUser) return c.json([]);

  const conditions = [];
  if (currentUser.email) {
    conditions.push(eq(bandInvitations.invitedEmail, currentUser.email.toLowerCase()));
  }
  if (currentUser.phone) {
    conditions.push(eq(bandInvitations.invitedPhone, currentUser.phone));
  }

  if (conditions.length === 0) return c.json([]);

  const invitations = await db
    .select({
      invitation: bandInvitations,
      bandName: bands.name,
      inviterFirstName: users.firstName,
      inviterLastName: users.lastName,
    })
    .from(bandInvitations)
    .innerJoin(bands, and(eq(bandInvitations.bandId, bands.id), isNull(bands.deletedAt)))
    .innerJoin(users, eq(bandInvitations.invitedBy, users.id))
    .where(and(
      eq(bandInvitations.status, 'pending'),
      conditions.length === 1 ? conditions[0] : or(...conditions),
    ));

  return c.json(invitations.map(r => ({
    id: r.invitation.id,
    band_id: r.invitation.bandId,
    band_name: r.bandName,
    invited_email: r.invitation.invitedEmail,
    invited_phone: r.invitation.invitedPhone,
    inviter_name: `${r.inviterFirstName ?? ''} ${r.inviterLastName ?? ''}`.trim(),
    status: r.invitation.status,
    join_code_snapshot: r.invitation.joinCodeSnapshot,
    created_at: r.invitation.createdAt,
  })));
});

userScoped.post('/:id/accept', requireAuth, async (c) => {
  const userId = c.get('userId');
  const invitationId = c.req.param('id');

  const [currentUser] = await db.select({
    email: users.email,
    phone: users.phone,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!currentUser) return c.json({ error: 'User not found' }, 404);

  const [invitation] = await db.select().from(bandInvitations)
    .where(and(
      eq(bandInvitations.id, invitationId),
      eq(bandInvitations.status, 'pending'),
    ))
    .limit(1);

  if (!invitation) return c.json({ error: 'Invitation not found' }, 404);

  const emailMatch = invitation.invitedEmail && currentUser.email &&
    invitation.invitedEmail.toLowerCase() === currentUser.email.toLowerCase();
  const phoneMatch = invitation.invitedPhone && currentUser.phone &&
    invitation.invitedPhone === currentUser.phone;

  if (!emailMatch && !phoneMatch) {
    return c.json({ error: 'This invitation is not for you' }, 403);
  }

  const [existingMembership] = await db.select().from(bandMemberships)
    .where(and(
      eq(bandMemberships.bandId, invitation.bandId),
      eq(bandMemberships.userId, userId),
    ))
    .limit(1);

  if (existingMembership && !existingMembership.deletedAt) {
    await db.update(bandInvitations)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(bandInvitations.id, invitationId));
    return c.json({ bandId: invitation.bandId, status: 'already_member' });
  }

  await db.insert(bandMemberships).values({
    bandId: invitation.bandId,
    userId,
    role: 'member',
    isApproved: true,
    invitedBy: invitation.invitedBy,
    joinedAt: new Date(),
  }).onConflictDoUpdate({
    target: [bandMemberships.bandId, bandMemberships.userId],
    set: {
      deletedAt: null,
      isApproved: true,
      invitedBy: invitation.invitedBy,
      joinedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await db.update(bandInvitations)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(bandInvitations.id, invitationId));

  return c.json({ bandId: invitation.bandId, status: 'accepted' });
});

userScoped.post('/:id/decline', requireAuth, async (c) => {
  const userId = c.get('userId');
  const invitationId = c.req.param('id');

  const [currentUser] = await db.select({
    email: users.email,
    phone: users.phone,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!currentUser) return c.json({ error: 'User not found' }, 404);

  const [invitation] = await db.select().from(bandInvitations)
    .where(and(
      eq(bandInvitations.id, invitationId),
      eq(bandInvitations.status, 'pending'),
    ))
    .limit(1);

  if (!invitation) return c.json({ error: 'Invitation not found' }, 404);

  const emailMatch = invitation.invitedEmail && currentUser.email &&
    invitation.invitedEmail.toLowerCase() === currentUser.email.toLowerCase();
  const phoneMatch = invitation.invitedPhone && currentUser.phone &&
    invitation.invitedPhone === currentUser.phone;

  if (!emailMatch && !phoneMatch) {
    return c.json({ error: 'This invitation is not for you' }, 403);
  }

  await db.update(bandInvitations)
    .set({ status: 'declined', updatedAt: new Date() })
    .where(eq(bandInvitations.id, invitationId));

  return c.json({ status: 'declined' });
});

export { bandScoped as bandInvitationsRouter, userScoped as userInvitationsRouter };
