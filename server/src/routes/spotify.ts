import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

let spotifyToken: string | null = null;
let tokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < tokenExpiresAt - 30000) return spotifyToken;

  const clientId = process.env.VITE_SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.VITE_SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error('Failed to get Spotify token');

  const data = await res.json() as { access_token: string; expires_in: number };
  spotifyToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return spotifyToken;
}

// GET /api/spotify/search?q=...&type=track,artist
app.get('/search', requireAuth, async (c) => {
  const q = c.req.query('q');
  const type = c.req.query('type') ?? 'track';

  if (!q) return c.json({ error: 'q param required' }, 400);

  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
    return c.json(await res.json());
  } catch (err: any) {
    console.error('[Spotify] Search error:', err.message);
    return c.json({ error: 'Spotify search failed' }, 502);
  }
});

// GET /api/spotify/track/:id
app.get('/track/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  try {
    const token = await getSpotifyToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
    return c.json(await res.json());
  } catch (err: any) {
    return c.json({ error: 'Spotify fetch failed' }, 502);
  }
});

export default app;
