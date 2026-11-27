import { Hono } from 'hono';
import { z } from 'zod';
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  isHttpsRequest,
  parseCookieHeader,
  verifyCredentials,
  verifySessionToken,
  type ResolvedAuthConfig,
} from '../lib/auth.js';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Vui lòng nhập tên đăng nhập').max(100),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(200),
});

const MAX_FAILED_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function getClientKey(forwardedFor: string | undefined, realIp: string | undefined): string {
  const firstForwarded = forwardedFor?.split(',')[0]?.trim();
  return firstForwarded || realIp?.trim() || 'local';
}

export function createAuthRoutes(authConfig: ResolvedAuthConfig): Hono {
  const app = new Hono();
  const failedAttempts = new Map<string, RateLimitEntry>();

  app.get('/auth/me', (c) => {
    c.header('Cache-Control', 'no-store');
    const token = parseCookieHeader(c.req.header('cookie'), SESSION_COOKIE_NAME);
    const payload = verifySessionToken(token, authConfig.secret);
    if (!payload || payload.u.toLowerCase() !== authConfig.username.toLowerCase()) {
      return c.json({ authenticated: false, user: null });
    }

    return c.json({
      authenticated: true,
      user: {
        username: authConfig.username,
        name: authConfig.displayName,
      },
    });
  });

  app.post('/auth/login', async (c) => {
    c.header('Cache-Control', 'no-store');

    const now = Date.now();
    const clientKey = getClientKey(c.req.header('x-forwarded-for'), c.req.header('x-real-ip'));
    const existingEntry = failedAttempts.get(clientKey);
    if (existingEntry) {
      if (existingEntry.resetAt <= now) {
        failedAttempts.delete(clientKey);
      } else if (existingEntry.count >= MAX_FAILED_ATTEMPTS) {
        return c.json(
          { error: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.' },
          429,
        );
      }
    }

    const body = await c.req.json();
    const parsed = loginSchema.parse(body);

    const isValid = verifyCredentials(parsed.username, parsed.password, authConfig);
    if (!isValid) {
      const current = failedAttempts.get(clientKey);
      if (!current || current.resetAt <= now) {
        failedAttempts.set(clientKey, {
          count: 1,
          resetAt: now + RATE_LIMIT_WINDOW_MS,
        });
      } else {
        current.count += 1;
      }
      return c.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }, 401);
    }

    failedAttempts.delete(clientKey);

    const token = createSessionToken(authConfig.username, authConfig.secret);
    const isSecure = isHttpsRequest(c.req.url, c.req.header('x-forwarded-proto'));
    c.header('Set-Cookie', buildSessionCookie(token, isSecure));

    return c.json({
      authenticated: true,
      user: {
        username: authConfig.username,
        name: authConfig.displayName,
      },
    });
  });

  app.post('/auth/logout', (c) => {
    c.header('Cache-Control', 'no-store');
    const isSecure = isHttpsRequest(c.req.url, c.req.header('x-forwarded-proto'));
    c.header('Set-Cookie', buildClearSessionCookie(isSecure));
    return c.json({ authenticated: false, user: null });
  });

  return app;
}
