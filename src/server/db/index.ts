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
  const fromCwd = path.resolve(process.cwd(), 'drizzle');
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(import.meta.dirname, '../../../drizzle');
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
    const pool = new Pool({ connectionString: options.databaseUrl });
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
