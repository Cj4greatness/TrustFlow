import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS policy for browser clients of the TrustFlow API.
 *
 * Design (frontend contract request: browser calls the API directly):
 *  - The API authenticates with `Authorization: Bearer <access token>` only.
 *    It never reads cookies, so CORS runs with credentials OFF. A browser
 *    on another origin therefore cannot make the API act on ambient
 *    cookies, which keeps CORS from becoming a CSRF vector.
 *  - The allowed origins come from an explicit allowlist in the
 *    CORS_ALLOWED_ORIGINS environment variable. A wildcard is never
 *    accepted: startup fails instead. An empty/unset variable means CORS is
 *    not enabled at all (secure default; same-origin and server-to-server
 *    callers are unaffected).
 *  - Methods, request headers and exposed response headers are the exact
 *    set the API uses, not a broad pattern.
 */

/** Methods the API's controllers actually use (no PUT/HEAD routes exist). */
export const CORS_ALLOWED_METHODS = [
  'GET',
  'POST',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;

/**
 * Request headers a browser client may send. The payment idempotency key
 * travels in the JSON body (CreatePaymentDto.idempotencyKey), not in a
 * header, so no custom header is needed.
 */
export const CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type'] as const;

/**
 * Response headers browser JavaScript may read, beyond the CORS-safelisted
 * set. `Access-Control-Expose-Headers` does NOT support prefix wildcards
 * (`X-RateLimit-*` is not valid), so the real names are listed.
 * @nestjs/throttler appends the throttler name to each header; AuthModule
 * defines the throttlers `ip` and `email`. AuthThrottlerGuard also sets a
 * plain `Retry-After` on 429. These headers are only emitted on
 * /auth/login and /auth/register today.
 */
export const CORS_EXPOSED_HEADERS = [
  'Retry-After',
  'X-RateLimit-Limit-ip',
  'X-RateLimit-Remaining-ip',
  'X-RateLimit-Reset-ip',
  'X-RateLimit-Limit-email',
  'X-RateLimit-Remaining-email',
  'X-RateLimit-Reset-email',
] as const;

/** How long a browser may cache a preflight response, in seconds. */
export const CORS_PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Parses CORS_ALLOWED_ORIGINS (comma-separated) into a validated,
 * de-duplicated list of exact origins. Throws on anything unsafe or
 * malformed so a bad value stops the app at boot rather than silently
 * widening or breaking access.
 *
 * Each entry must be a bare origin, `scheme://host[:port]`, exactly as a
 * browser sends it in the Origin header: lowercase host, no path, no query,
 * no trailing slash, no default port, no wildcard. In production only
 * `https` origins are accepted.
 */
export function parseAllowedOrigins(
  raw: string | undefined,
  nodeEnv: string = 'development',
): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const origins = new Set<string>();

  for (const entry of entries) {
    if (entry.includes('*')) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS must list exact origins; wildcards are not allowed (got "${entry}")`,
      );
    }

    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry "${entry}" is not a valid origin (expected scheme://host[:port])`,
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry "${entry}" must use http or https`,
      );
    }

    if (url.origin !== entry) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry "${entry}" must be a bare origin exactly as a browser sends it ` +
          `(expected "${url.origin}": lowercase host, no path, query, trailing slash or default port)`,
      );
    }

    if (nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry "${entry}" must use https in production`,
      );
    }

    origins.add(entry);
  }

  return [...origins];
}

/**
 * Builds the options passed to `app.enableCors()`. Callers should only
 * invoke this (and enable CORS) when the allowlist is non-empty.
 * Origins are matched exactly; a request from any other origin gets no
 * `Access-Control-Allow-Origin` header and the browser blocks it.
 */
export function buildCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptions {
  return {
    origin: [...allowedOrigins],
    methods: [...CORS_ALLOWED_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
    exposedHeaders: [...CORS_EXPOSED_HEADERS],
    credentials: false,
    maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
  };
}
