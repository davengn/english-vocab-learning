import { Hono } from 'hono';
import { createDatabase, type DatabaseHandle } from '../../src/server/db/index.js';
import { seedDatabase } from '../../src/server/db/seed.js';
import { createApp } from '../../src/server/app.js';

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

function normalizeNetlifyRequest(req: Request): Request {
  const url = new URL(req.url);
  const fnPrefix = '/.netlify/functions/api';
  if (url.pathname === fnPrefix || url.pathname.startsWith(`${fnPrefix}/`)) {
    const suffix = url.pathname.slice(fnPrefix.length);
    url.pathname = `/api${suffix}`;
    return new Request(url.toString(), req);
  }
  return req;
}

export default async (req: Request): Promise<Response> => {
  const { app } = await getAppContext();
  return app.fetch(normalizeNetlifyRequest(req));
};
