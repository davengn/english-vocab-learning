import fs from 'node:fs';
import path from 'node:path';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type AppDatabase = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: AppDatabase;
  driver: 'pglite' | 'pg';
  close: () => Promise<void>;
}

function resolveMigrationsFolder(): string {
  const metaDir =
    typeof import.meta !== 'undefined' && typeof import.meta.dirname === 'string'
      ? import.meta.dirname
      : undefined;
  const cjsDir = typeof __dirname !== 'undefined' ? __dirname : undefined;

  const candidates = [
    path.resolve(process.cwd(), 'drizzle'),
    process.env.LAMBDA_TASK_ROOT ? path.resolve(process.env.LAMBDA_TASK_ROOT, 'drizzle') : '',
    '/var/task/drizzle',
    metaDir ? path.resolve(metaDir, '../../../drizzle') : '',
    cjsDir ? path.resolve(cjsDir, '../../../drizzle') : '',
    cjsDir ? path.resolve(cjsDir, '../../drizzle') : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), 'drizzle');
}

function resolvePgSslOption(databaseUrl: string): false | { rejectUnauthorized: boolean } | undefined {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable') {
      return false;
    }
    if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
      return undefined;
    }
    const hostname = parsed.hostname.toLowerCase();
    const isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'host.docker.internal';

    if (isLocalHost && sslMode !== 'require' && sslMode !== 'no-verify') {
      return undefined;
    }
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
}

export async function createDatabase(options?: {
  databaseUrl?: string;
  dataDir?: string;
  inMemory?: boolean;
  runMigrations?: boolean;
}): Promise<DatabaseHandle> {
  const migrationsFolder = resolveMigrationsFolder();
  const shouldMigrate = options?.runMigrations ?? true;

  if (options?.databaseUrl && !options?.inMemory) {
    const ssl = resolvePgSslOption(options.databaseUrl);
    const pool = new Pool({
      connectionString: options.databaseUrl,
      max: 3,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      ...(ssl !== undefined ? { ssl } : {}),
    });
    const db = drizzlePg(pool, { schema });
    if (shouldMigrate) {
      await migratePg(db, { migrationsFolder });
    }
    return {
      db,
      driver: 'pg',
      close: async () => {
        await pool.end();
      },
    };
  }

  // Dynamically import PGlite so serverless deployments with DATABASE_URL don't load WASM
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);

  let client: InstanceType<typeof PGlite>;
  if (options?.inMemory) {
    client = new PGlite();
  } else {
    const dataDir = path.resolve(options?.dataDir ?? process.env.DATA_DIR ?? './data/pgdata');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    client = new PGlite(dataDir);
  }

  await client.waitReady;
  const db = drizzlePglite(client, { schema });

  if (shouldMigrate) {
    await migratePglite(db, { migrationsFolder });
  }

  return {
    db,
    driver: 'pglite',
    close: async () => {
      await client.close();
    },
  };
}
