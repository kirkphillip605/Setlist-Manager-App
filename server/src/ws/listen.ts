import { getListenClient } from '../db/index.js';
import { db } from '../db/index.js';
import { bandMemberships } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import { wsManager } from './server.js';

interface BandChangePayload {
  band_id: string;
  table: string;
  version: number;
}

export async function startPgListener() {
  const client = await getListenClient();

  await client.query('LISTEN band_changes');
  console.log('[DB Listen] Listening on channel: band_changes');

  client.on('notification', async (msg) => {
    if (msg.channel !== 'band_changes' || !msg.payload) return;

    let payload: BandChangePayload;
    try {
      payload = JSON.parse(msg.payload);
    } catch {
      console.warn('[DB Listen] Invalid JSON payload:', msg.payload);
      return;
    }

    const { band_id, table, version } = payload;

    // Broadcast the delta notification to all clients subscribed to this band
    wsManager.broadcastToBand(band_id, {
      type:    'delta',
      band_id,
      table,
      version,
    });
  });

  client.on('error', (err) => {
    console.error('[DB Listen] Error:', err.message);
    // Reconnect is handled in getListenClient via the 'end' handler
    setTimeout(startPgListener, 5000);
  });
}
