import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { AppDatabase } from './db/index.js';
import {
  SESSION_COOKIE_NAME,
  parseCookieHeader,
  resolveAuthConfig,
  verifySessionToken,
  type AuthOptions,
} from './lib/auth.js';
import { createAuthRoutes } from './routes/auth.js';
import { createSettingsRoutes } from './routes/settings.js';
import { createSessionsRoutes } from './routes/sessions.js';
import { createVocabularyRoutes } from './routes/vocabulary.js';
import { createGrammarRoutes } from './routes/grammar.js';
import { createPracticeRoutes } from './routes/practice.js';
import { createReviewRoutes } from './routes/review.js';
import { createMistakesRoutes } from './routes/mistakes.js';
import { createAnalyticsRoutes } from './routes/analytics.js';

export interface CreateAppOptions {
  driver?: 'pglite' | 'pg';
  auth?: AuthOptions;
}

export function createApp(db: AppDatabase, options?: CreateAppOptions): Hono {
  const app = new Hono();
  const authConfig = resolveAuthConfig(options?.auth);

  app.get('/api/health', (c) => {
    return c.json({
      ok: true,
      status: 'healthy',
      ...(options?.driver ? { driver: options.driver } : {}),
      timestamp: new Date().toISOString(),
    });
  });

  app.route('/api', createAuthRoutes(authConfig));

  app.use('/api/*', async (c, next) => {
    const reqPath = c.req.path;
    if (reqPath === '/api/health' || reqPath.startsWith('/api/auth/')) {
      await next();
      return;
    }

    const token = parseCookieHeader(c.req.header('cookie'), SESSION_COOKIE_NAME);
    const payload = verifySessionToken(token, authConfig.secret);
    if (!payload || payload.u.toLowerCase() !== authConfig.username.toLowerCase()) {
      return c.json({ error: 'Vui lòng đăng nhập để tiếp tục' }, 401);
    }

    await next();
  });

  app.route('/api', createSettingsRoutes(db));
  app.route('/api', createSessionsRoutes(db));
  app.route('/api', createVocabularyRoutes(db));
  app.route('/api', createGrammarRoutes(db));
  app.route('/api', createPracticeRoutes(db));
  app.route('/api', createReviewRoutes(db));
  app.route('/api', createMistakesRoutes(db));
  app.route('/api', createAnalyticsRoutes(db));

  app.all('/api/*', (c) => {
    return c.json({ error: 'Không tìm thấy đường dẫn API' }, 404);
  });

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json(
        {
          error: err.issues[0]?.message ?? 'Dữ liệu đầu vào không hợp lệ',
          details: err.flatten(),
        },
        400,
      );
    }

    if (err instanceof SyntaxError) {
      return c.json({ error: 'Dữ liệu JSON không hợp lệ' }, 400);
    }

    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    console.error('[API Error]', err);
    return c.json({ error: 'Đã xảy ra lỗi hệ thống máy chủ' }, 500);
  });

  return app;
}
