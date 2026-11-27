import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createDatabase, type DatabaseHandle } from '../src/server/db/index.js';
import { seedDatabase } from '../src/server/db/seed.js';
import { createApp } from '../src/server/app.js';

interface AppContext {
  app: Hono;
  dbHandle: DatabaseHandle;
}

let cachedContextPromise: Promise<AppContext> | null = null;

function getAppContext(): Promise<AppContext> {
  if (!cachedContextPromise) {
    cachedContextPromise = (async () => {
      const dbHandle = await createDatabase({
        databaseUrl: process.env.DATABASE_URL,
        dataDir: process.env.DATA_DIR ?? '/tmp/pgdata',
      });
      await seedDatabase(dbHandle.db);
      const app = createApp(dbHandle.db, { driver: dbHandle.driver });
      return { app, dbHandle };
    })().catch((err) => {
      cachedContextPromise = null;
      throw err;
    });
  }
  return cachedContextPromise;
}

const entryApp = new Hono();
entryApp.all('*', async (c) => {
  const { app } = await getAppContext();
  return app.fetch(c.req.raw);
});

const handler = handle(entryApp);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
