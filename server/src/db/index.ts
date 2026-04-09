import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool, Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');

function parseConnectionConfig(url: string): pg.ConnectionConfig {
  const match = url.match(
    /^postgresql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/
  );
  if (!match) {
    return { connectionString: url };
  }
  const [, user, password, host, port, database] = match;
  return { user, password, host, port: parseInt(port, 10), database };
}

const connConfig = parseConnectionConfig(DATABASE_URL);

export const pool = new Pool({ ...connConfig, max: 10 });

export const db = drizzle(pool, { schema });

let listenClient: InstanceType<typeof Client> | null = null;

export async function getListenClient(): Promise<InstanceType<typeof Client>> {
  if (listenClient) return listenClient;

  listenClient = new Client(connConfig);
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
