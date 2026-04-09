import { createMiddleware } from 'hono/factory';
import { auth } from '../auth.js';

export type AuthVariables = {
  userId: string;
  sessionId: string;
  platformRole: string;
};

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const user = session.user as typeof session.user & {
    platformRole?: string;
    isActive?: boolean;
  };

  if (user.isActive === false) {
    return c.json({ error: 'Account is inactive' }, 403);
  }

  c.set('userId', user.id);
  c.set('sessionId', session.session.id);
  c.set('platformRole', user.platformRole ?? 'user');

  await next();
});

export const requirePlatformAdmin = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const role = c.get('platformRole');
  if (role !== 'platform_admin') {
    return c.json({ error: 'Forbidden: platform admin only' }, 403);
  }
  await next();
});
