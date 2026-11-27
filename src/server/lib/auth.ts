import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export const SESSION_COOKIE_NAME = 'elos_session';
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
export const DEFAULT_AUTH_USERNAME = 'mywife';
export const DEFAULT_AUTH_DISPLAY_NAME = 'mywife';
export const DEFAULT_AUTH_PASSWORD_HASH =
  'scrypt:8b0bd2cd90102e69d7cc7a791a189ef6:79165c2a5e52294be55532a35a40d3fb7a78df1dc8442ad4a20b4ec6544947fd53056700f7d8493ced6a280a44cb925fb59e9faa06558fc05c356ca8daa605ff';

export interface AuthOptions {
  username?: string;
  displayName?: string;
  passwordHash?: string;
  password?: string;
  secret?: string;
}

export interface ResolvedAuthConfig {
  username: string;
  displayName: string;
  passwordHash: string;
  secret: string;
}

export interface SessionPayload {
  u: string;
  iat: number;
  exp: number;
}

/**
 * Generates a per-password salted scrypt hash in the format `scrypt:<saltHex>:<hashHex>`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt:<saltHex>:<hashHex>` hash
 * using constant-time comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex) || expectedHex.length % 2 !== 0) {
    return false;
  }

  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = scryptSync(password, salt, expected.length);
    if (derived.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Resolves the active authentication configuration from explicit options, environment variables,
 * and safe defaults (never embedding plaintext passwords in source code).
 */
export function resolveAuthConfig(options?: AuthOptions): ResolvedAuthConfig {
  const username = (
    options?.username ??
    process.env.AUTH_USERNAME ??
    DEFAULT_AUTH_USERNAME
  ).trim();

  const displayName = (
    options?.displayName ??
    process.env.AUTH_DISPLAY_NAME ??
    (username || DEFAULT_AUTH_DISPLAY_NAME)
  ).trim();

  let passwordHash = DEFAULT_AUTH_PASSWORD_HASH;
  if (options?.passwordHash) {
    passwordHash = options.passwordHash;
  } else if (options?.password !== undefined) {
    passwordHash = hashPassword(options.password);
  } else if (process.env.AUTH_PASSWORD_HASH) {
    passwordHash = process.env.AUTH_PASSWORD_HASH;
  } else if (process.env.AUTH_PASSWORD) {
    passwordHash = hashPassword(process.env.AUTH_PASSWORD);
  }

  const secret =
    options?.secret ||
    process.env.AUTH_SECRET ||
    (process.env.DATABASE_URL
      ? createHash('sha256')
          .update(`elos-session-v1:${process.env.DATABASE_URL}`)
          .digest('hex')
      : 'local-dev-elos-session-secret-v1');

  return {
    username: username || DEFAULT_AUTH_USERNAME,
    displayName: displayName || DEFAULT_AUTH_DISPLAY_NAME,
    passwordHash,
    secret,
  };
}

function sha256Equal(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Verifies username (trimmed, case-insensitive) and password in constant time.
 * Always executes scrypt verification to prevent username enumeration via timing.
 */
export function verifyCredentials(
  username: string,
  password: string,
  config: ResolvedAuthConfig,
): boolean {
  const passwordMatch = verifyPassword(password, config.passwordHash);
  const usernameMatch = sha256Equal(
    username.trim().toLowerCase(),
    config.username.trim().toLowerCase(),
  );
  return usernameMatch && passwordMatch;
}

/**
 * Creates a stateless HMAC-SHA256 signed session token (`<payloadB64Url>.<sigB64Url>`).
 */
export function createSessionToken(
  username: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  ttlSec = SESSION_TTL_SECONDS,
): string {
  const payload: SessionPayload = {
    u: username,
    iat: nowSec,
    exp: nowSec + ttlSec,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${sig}`;
}

/**
 * Verifies signature and expiration of a signed session token.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex !== token.lastIndexOf('.')) {
    return null;
  }

  const encodedPayload = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  if (!encodedPayload || !providedSig) {
    return null;
  }

  const expectedSig = createHmac('sha256', secret).update(encodedPayload).digest();
  let providedSigBuf: Buffer;
  try {
    providedSigBuf = Buffer.from(providedSig, 'base64url');
  } catch {
    return null;
  }

  if (providedSigBuf.length !== expectedSig.length || !timingSafeEqual(providedSigBuf, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<
      SessionPayload
    >;
    if (
      typeof parsed.u !== 'string' ||
      !parsed.u ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= nowSec
    ) {
      return null;
    }
    return {
      u: parsed.u,
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts a single cookie value by name from a raw `Cookie` HTTP header.
 */
export function parseCookieHeader(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = pair.slice(0, eqIndex).trim();
    if (key !== name) continue;
    const rawVal = pair.slice(eqIndex + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

/**
 * Checks whether the current request arrived over HTTPS (including reverse proxies).
 */
export function isHttpsRequest(url: string, forwardedProto: string | undefined): boolean {
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') {
    return true;
  }
  return url.toLowerCase().startsWith('https://');
}

/**
 * Formats the HttpOnly Set-Cookie header value for an active session.
 */
export function buildSessionCookie(token: string, isSecure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${isSecure ? '; Secure' : ''}`;
}

/**
 * Formats the HttpOnly Set-Cookie header value that immediately clears the session cookie.
 */
export function buildClearSessionCookie(isSecure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${isSecure ? '; Secure' : ''}`;
}
