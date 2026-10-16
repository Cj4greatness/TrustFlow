// Pure helpers for the BFF routes. Kept free of Next.js types so they can be
// unit tested.

import type { Session, SessionUser } from "./types";

export type BackendAuthSuccess = {
  session: Session;
  refreshToken: string;
};

/**
 * Split the backend's { user, accessToken, refreshToken } response. The
 * refresh token is returned separately so the caller can put it in the cookie
 * and never in the response body. Returns null if the shape is not trusted.
 */
export function splitAuthResponse(body: unknown): BackendAuthSuccess | null {
  if (typeof body !== "object" || body === null) return null;
  const { user, accessToken, refreshToken } = body as Record<string, unknown>;

  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (typeof refreshToken !== "string" || refreshToken === "") return null;
  if (typeof user !== "object" || user === null) return null;

  const candidate = user as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.email !== "string") {
    return null;
  }

  return {
    session: { accessToken, user: candidate as unknown as SessionUser },
    refreshToken,
  };
}

/** Keep only the listed fields; everything else is dropped. */
export function pickFields(
  body: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }
  const source = body as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== undefined) picked[key] = value;
    }
  }
  return picked;
}

export type PublicErrorBody = {
  success: false;
  message: string | string[];
  statusCode: number;
  details?: { code: string };
};

/** Re-emit a backend error keeping only message, status, and details.code. */
export function sanitizeErrorBody(
  status: number,
  body: unknown,
): PublicErrorBody {
  const result: PublicErrorBody = {
    success: false,
    message: "Request failed",
    statusCode: status,
  };
  if (typeof body !== "object" || body === null) return result;

  const { message, details } = body as { message?: unknown; details?: unknown };
  if (typeof message === "string") {
    result.message = message;
  } else if (Array.isArray(message)) {
    const strings = message.filter((m): m is string => typeof m === "string");
    if (strings.length > 0) result.message = strings;
  }
  if (typeof details === "object" && details !== null) {
    const code = (details as { code?: unknown }).code;
    if (typeof code === "string") result.details = { code };
  }
  return result;
}

/** Only rate-limit and retry headers are passed through to the browser. */
export function forwardedRateLimitHeaders(
  from: Headers,
): Record<string, string> {
  const out: Record<string, string> = {};
  from.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("x-ratelimit-") || lower === "retry-after") {
      out[lower] = value;
    }
  });
  return out;
}
