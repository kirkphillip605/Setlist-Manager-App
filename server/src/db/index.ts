import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool, Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');

function buildSafeConnectionString(raw: string): string {
  try {
    const parsed = new URL(raw);
    return raw;
  } catch {
    const match = raw.match(
      /^(postgresql|postgres):\/\/([^:]*):(.*)@(\[[^\]]+\]|[^:]+?)(?::(\d+))?\/(.+)$/
    );
    if (!match) {
      throw new Error(
        '[DB] DATABASE_URL is not a valid PostgreSQL connection string'
      );
    }
    const [, protocol, user, password, host, port, dbAndParams] = match;
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);
    const portPart = port ? `:${port}` : '';
    return `${protocol}://${encodedUser}:${encodedPassword}@${host}${portPart}/${dbAndParams}`;
  }
}

const safeConnectionString = buildSafeConnectionString(DATABASE_URL);

export const pool = new Pool({ connectionString: safeConnectionString, max: 10 });

export const db = drizzle(pool, { schema });

let listenClient: InstanceType<typeof Client> | null = null;

export async function getListenClient(): Promise<InstanceType<typeof Client>> {
  if (listenClient) return listenClient;

  listenClient = new Client({ connectionString: safeConnectionString });
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
