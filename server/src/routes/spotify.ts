import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

interface SpotifyAlbum {
  name: string;
  images: SpotifyImage[];
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_urls: { spotify: string };
  duration_ms: number;
}

interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[];
  };
}

interface MusicResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  spotifyUrl: string;
  duration: string;
}

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

  const data = await res.json() as SpotifyTokenResponse;
  spotifyToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return spotifyToken;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

app.get('/search', requireAuth, async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q param required' }, 400);

  try {
    const token = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=20`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);

    const data = await res.json() as SpotifySearchResponse;
    const tracks = data.tracks?.items ?? [];

    const seen = new Set<string>();
    const results: MusicResult[] = [];

    for (const track of tracks) {
      const artist = (track.artists ?? []).map((a) => a.name).join(', ');
      const title = track.name;
      const key = `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;

      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        id: track.id,
        title: track.name,
        artist,
        album: track.album?.name ?? '',
        coverUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '',
        spotifyUrl: track.external_urls?.spotify || '',
        duration: track.duration_ms ? formatDuration(track.duration_ms) : '',
      });

      if (results.length >= 10) break;
    }

    return c.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Spotify] Search error:', message);
    return c.json({ error: 'Spotify search failed' }, 502);
  }
});

app.get('/track/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  try {
    const token = await getSpotifyToken();
    const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
    return c.json(await res.json() as SpotifyTrack);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Spotify] Track fetch error:', message);
    return c.json({ error: 'Spotify fetch failed' }, 502);
  }
});

export default app;
