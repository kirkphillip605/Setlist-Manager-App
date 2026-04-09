import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool, Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');

// Drizzle pool — used for all regular queries
export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });

// Dedicated client for pg LISTEN/NOTIFY — must not be part of the pool
// The listen client is initialized lazily by the WS server startup
let listenClient: InstanceType<typeof Client> | null = null;

export async function getListenClient(): Promise<InstanceType<typeof Client>> {
  if (listenClient) return listenClient;

  listenClient = new Client({ connectionString: DATABASE_URL });
  await listenClient.connect();

  listenClient.on('error', (err) => {
    console.error('[DB Listen] Client error:', err.message);
    listenClient = null;
    setTimeout(() => getListenClient(), 5000);
  });

  listenClient.on('end', () => {
    console.warn('[DB Listen] Client disconnected — will reconnect');
    listenClient = null;
    setTimeout(() => getListenClient(), 5000);
  });

  return listenClient;
}
