// Secret-free event log for the BFF auth routes.
//
// The logger accepts only a fixed event name, an integer HTTP status and an
// upper-case error code, so it cannot carry an access token, a refresh token,
// a cookie, a header or a request or response body. Events describe what the
// BFF observed; they never claim why (a rejected refresh is not proof that a
// token was reused). Frequencies can be counted from these lines after launch.

import { AUTH_ERROR_CODES } from "../../api/errors";

export const AUTH_LOG_EVENTS = [
  "refresh_rotation_race",
  "refresh_rejected",
  "refresh_throttled",
  "refresh_server_error",
  "refresh_backend_unreachable",
  "refresh_invalid_backend_response",
] as const;

export type AuthLogEvent = (typeof AUTH_LOG_EVENTS)[number];

export type AuthLogFields = {
  event: AuthLogEvent;
  status?: number | null;
  code?: string | null;
};

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Name what the backend answered to a refresh. Never claims a cause. */
export function classifyRefreshFailure(
  status: number,
  code?: string | null,
): AuthLogEvent {
  if (
    status === 401 &&
    code === AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED
  ) {
    return "refresh_rotation_race";
  }
  if (status === 429) return "refresh_throttled";
  if (status >= 500) return "refresh_server_error";
  return "refresh_rejected";
}

export function formatAuthLog(
  fields: AuthLogFields,
  now: Date = new Date(),
): string {
  const entry: Record<string, string | number> = {
    ts: now.toISOString(),
    scope: "auth",
    event: fields.event,
  };
  if (Number.isInteger(fields.status)) entry.status = fields.status as number;
  if (typeof fields.code === "string" && CODE_PATTERN.test(fields.code)) {
    entry.code = fields.code;
  }
  return JSON.stringify(entry);
}

export function logAuthEvent(
  fields: AuthLogFields,
  sink: (line: string) => void = (line) => console.warn(line),
): void {
  if (!AUTH_LOG_EVENTS.includes(fields.event)) return;
  try {
    sink(formatAuthLog(fields));
  } catch {
    // Logging must never break a request.
  }
}
