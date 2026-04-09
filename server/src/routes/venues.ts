import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVariables }>();

// GET /api/venues/search?q=...
// Proxies to Google Places Text Search API
app.get('/search', requireAuth, async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q param required' }, 400);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return c.json({ items: [] });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&type=establishment&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as { results: any[] };

    const items = (data.results ?? []).slice(0, 8).map((p: any) => ({
      place_id:         p.place_id,
      name:             p.name,
      formatted_address: p.formatted_address,
      geometry:         p.geometry,
    }));

    return c.json({ items });
  } catch (err: any) {
    console.error('[Venues] Search error:', err.message);
    return c.json({ items: [] });
  }
});

export default app;
