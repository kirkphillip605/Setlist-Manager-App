import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { auth } from './auth.js';
import { startPgListener } from './ws/listen.js';
import { wsManager } from './ws/server.js';
import { db } from './db/index.js';
import { bandMemberships, bands } from './db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';

// Route imports
import bandsRouter        from './routes/bands.js';
import songsRouter        from './routes/songs.js';
import setlistsRouter     from './routes/setlists.js';
import gigsRouter         from './routes/gigs.js';
import gigSessionsRouter  from './routes/gig-sessions.js';
import usersRouter        from './routes/users.js';
import syncRouter         from './routes/sync.js';
import spotifyRouter      from './routes/spotify.js';
import venuesRouter       from './routes/venues.js';

const PORT         = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://setlist.kirknet.io';

const app = new Hono();

// ── CORS ──────────────────────────────────────────────────────────
app.use('*', logger());
app.use('*', cors({
  origin: [
    FRONTEND_URL,
    'https://setlist.kirknet.io',
    'http://localhost:5000',
    'http://localhost:3001',
    'capacitor://localhost',
  ],
  allowHeaders:  ['Content-Type', 'Authorization', 'Cookie'],
  allowMethods:  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Set-Cookie'],
  credentials:   true,
  maxAge:        86400,
}));

// ── BetterAuth ────────────────────────────────────────────────────
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

// ── Universal links ───────────────────────────────────────────────
app.get('/.well-known/apple-app-site-association', (c) =>
  c.json({
    applinks: {
      apps: [],
      details: [{
        appID: `${process.env.APPLE_TEAM_ID ?? 'TEAMID'}.com.kirknetllc.setlistpro`,
        paths: ['/join/*', '/auth/*'],
      }],
    },
  })
);
app.get('/.well-known/assetlinks.json', (c) =>
  c.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace:             'android_app',
      package_name:          'com.kirknetllc.setlistpro',
      sha256_cert_fingerprints: [process.env.ANDROID_CERT_FINGERPRINT ?? ''],
    },
  }])
);

// ── API routes ────────────────────────────────────────────────────
app.route('/api/bands',                      bandsRouter);
app.route('/api/bands/:bandId/songs',        songsRouter);
app.route('/api/bands/:bandId/setlists',     setlistsRouter);
app.route('/api/bands/:bandId/gigs',         gigsRouter);
app.route('/api/bands/:bandId/gig-sessions', gigSessionsRouter);
app.route('/api/users',                      usersRouter);
app.route('/api/sync',                       syncRouter);
app.route('/api/spotify',                    spotifyRouter);
app.route('/api/venues',                     venuesRouter);

// ── App status (used by useAppStatus on the frontend) ─────────────
app.get('/api/status', (c) => {
  const env      = c.req.query('env')      ?? 'production';
  const platform = c.req.query('platform') ?? 'web';
  return c.json({
    status:            'ok',
    env,
    platform,
    maintenance:       false,
    update_required:   false,
    min_version:       '1.0.0',
    message:           null,
  });
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (c) => c.json({
  status:      'ok',
  connections: wsManager.getConnectionCount(),
  timestamp:   new Date().toISOString(),
}));

// ── HTTP server ───────────────────────────────────────────────────
const httpServer = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[Server] SetlistPRO API running on port ${info.port}`);
});

// ── WebSocket server (attached to same HTTP server) ───────────────
const wss = new WebSocketServer({ noServer: true });

(httpServer as any).on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
  const url   = new URL(req.url ?? '/', 'http://localhost');
  const token = url.searchParams.get('token');

  let userId: string | null    = null;
  let userBandIds: string[]    = [];

  if (token) {
    try {
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: `better-auth.session_token=${token}` }),
      });
      if (session?.user?.id) {
        userId = session.user.id;
        const memberships = await db
          .select({ bandId: bandMemberships.bandId })
          .from(bandMemberships)
          .innerJoin(bands, eq(bandMemberships.bandId, bands.id))
          .where(and(
            eq(bandMemberships.userId, userId),
            eq(bandMemberships.isApproved, true),
            isNull(bandMemberships.deletedAt),
            isNull(bands.deletedAt),
          ));
        userBandIds = memberships.map(m => m.bandId as string);
      }
    } catch {
      console.warn('[WS] Session resolution failed');
    }
  }

  if (!userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
    ws.close(4001, 'Unauthorized');
    return;
  }

  wsManager.registerConnection(ws, userId, userBandIds);
  ws.send(JSON.stringify({ type: 'connected', bandIds: userBandIds }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'join_session':
          if (msg.sessionId) {
            wsManager.joinSession(ws, msg.sessionId);
            ws.send(JSON.stringify({ type: 'joined_session', sessionId: msg.sessionId }));
          }
          break;
        case 'leave_session':
          if (msg.sessionId) wsManager.leaveSession(ws, msg.sessionId);
          break;
        case 'update_bands':
          if (Array.isArray(msg.bandIds)) wsManager.updateBandSubscriptions(ws, msg.bandIds);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => wsManager.removeConnection(ws));
  ws.on('error', () => wsManager.removeConnection(ws));
});

// ── Start pg LISTEN loop ──────────────────────────────────────────
startPgListener().catch((err: Error) => {
  console.error('[Server] pg LISTEN startup failed:', err.message);
});

console.log('[Server] Startup complete');
