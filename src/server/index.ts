import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createDatabase } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { createApp } from './app.js';

async function bootstrap() {
  const dbHandle = await createDatabase({
    databaseUrl: process.env.DATABASE_URL,
    dataDir: process.env.DATA_DIR,
  });

  await seedDatabase(dbHandle.db);

  const app = createApp(dbHandle.db);

  const clientDistDir = path.resolve(process.cwd(), 'dist/client');
  const indexHtmlPath = path.join(clientDistDir, 'index.html');

  if (fs.existsSync(clientDistDir)) {
    app.use(
      '/*',
      serveStatic({
        root: './dist/client',
      }),
    );

    if (fs.existsSync(indexHtmlPath)) {
      const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
      app.get('*', (c) => {
        if (c.req.path.startsWith('/api')) {
          return c.json({ error: 'Không tìm thấy đường dẫn API' }, 404);
        }
        return c.html(indexHtml);
      });
    }
  }

  const port = Number(process.env.PORT || 3001);
  const server = serve({
    fetch: app.fetch,
    port,
  });

  console.log(
    `[English Learning OS] API server đang chạy tại http://localhost:${port} (driver: ${dbHandle.driver})`,
  );

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[English Learning OS] Đang tắt máy chủ (${signal})...`);
    server.close();
    await dbHandle.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

bootstrap().catch((err) => {
  console.error('[English Learning OS] Không thể khởi động máy chủ:', err);
  process.exit(1);
});
