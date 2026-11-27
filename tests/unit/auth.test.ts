import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTH_PASSWORD_HASH,
  DEFAULT_AUTH_USERNAME,
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashPassword,
  isHttpsRequest,
  parseCookieHeader,
  resolveAuthConfig,
  verifyCredentials,
  verifyPassword,
  verifySessionToken,
} from '../../src/server/lib/auth.js';

describe('Auth utilities', () => {
  it('hashes and verifies passwords using salted scrypt', () => {
    const hashA = hashPassword('StrongPass!23');
    const hashB = hashPassword('StrongPass!23');

    expect(hashA).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(hashA).not.toBe(hashB);
    expect(verifyPassword('StrongPass!23', hashA)).toBe(true);
    expect(verifyPassword('WrongPass!23', hashA)).toBe(false);
    const flippedLastChar = hashA.endsWith('0') ? '1' : '0';
    expect(verifyPassword('StrongPass!23', `${hashA.slice(0, -1)}${flippedLastChar}`)).toBe(false);
    expect(verifyPassword('StrongPass!23', 'malformed-hash')).toBe(false);
  });

  it('uses safe hashed defaults without embedding plaintext secrets', () => {
    expect(DEFAULT_AUTH_USERNAME).toBe('mywife');
    expect(DEFAULT_AUTH_PASSWORD_HASH.startsWith('scrypt:')).toBe(true);

    const config = resolveAuthConfig({
      username: 'TestUser',
      password: 'sample-secret-password',
      secret: 'unit-test-secret',
    });
    expect(verifyCredentials('testuser', 'sample-secret-password', config)).toBe(true);
    expect(verifyCredentials('  TESTUSER  ', 'sample-secret-password', config)).toBe(true);
    expect(verifyCredentials('otheruser', 'sample-secret-password', config)).toBe(false);
    expect(verifyCredentials('testuser', 'wrong-password', config)).toBe(false);
  });

  it('creates and verifies HMAC-SHA256 signed session tokens with expiration checks', () => {
    const secret = 'super-secret-signing-key';
    const token = createSessionToken('mywife', secret, 1_000, 60);

    const validPayload = verifySessionToken(token, secret, 1_030);
    expect(validPayload).toEqual({
      u: 'mywife',
      iat: 1_000,
      exp: 1_060,
    });

    // Expired
    expect(verifySessionToken(token, secret, 1_060)).toBeNull();
    expect(verifySessionToken(token, secret, 2_000)).toBeNull();

    // Wrong secret
    expect(verifySessionToken(token, 'wrong-secret', 1_030)).toBeNull();

    // Tampered payload or signature
    const [payloadPart, sigPart] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ u: 'admin', iat: 1_000, exp: 9_999 }),
      'utf8',
    ).toString('base64url');
    expect(verifySessionToken(`${tamperedPayload}.${sigPart}`, secret, 1_030)).toBeNull();
    expect(verifySessionToken(`${payloadPart}.tampered`, secret, 1_030)).toBeNull();
    expect(verifySessionToken('not-a-valid-token', secret, 1_030)).toBeNull();
  });

  it('parses Cookie headers, builds HttpOnly cookies, and detects HTTPS', () => {
    const token = 'abc.def';
    const cookieHeader = `other=123; ${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; theme=warm`;
    expect(parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME)).toBe(token);
    expect(parseCookieHeader(cookieHeader, 'missing')).toBeNull();
    expect(parseCookieHeader(undefined, SESSION_COOKIE_NAME)).toBeNull();

    const httpCookie = buildSessionCookie(token, false);
    expect(httpCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(httpCookie).toContain('HttpOnly');
    expect(httpCookie).toContain('SameSite=Lax');
    expect(httpCookie).not.toContain('Secure');

    const httpsCookie = buildSessionCookie(token, true);
    expect(httpsCookie).toContain('; Secure');

    const clearedCookie = buildClearSessionCookie(true);
    expect(clearedCookie).toContain('Max-Age=0');
    expect(clearedCookie).toContain('; Secure');

    expect(isHttpsRequest('https://app.example.com/api/auth/login', undefined)).toBe(true);
    expect(isHttpsRequest('http://127.0.0.1/api/auth/login', 'https, http')).toBe(true);
    expect(isHttpsRequest('http://localhost:3001/api/auth/login', undefined)).toBe(false);
  });
});
