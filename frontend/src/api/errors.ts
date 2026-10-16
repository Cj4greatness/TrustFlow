// Normalises every failure from the TrustFlow API into one typed ApiError.
//
// Backend error body (verified, develop 11158814):
//   { success: false, message: string | string[], statusCode, timestamp,
//     path, details?: { code?: string } }
// Validation errors carry `message` as an array of plain strings. Stable
// machine-readable codes (e.g. REFRESH_TOKEN_RECENTLY_ROTATED) live at
// details.code.

export type ApiErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "throttled"
  | "server"
  | "network"
  | "unknown";

export const AUTH_ERROR_CODES = {
  REFRESH_TOKEN_RECENTLY_ROTATED: "REFRESH_TOKEN_RECENTLY_ROTATED",
  SESSION_REPLACED_BY_NEW_LOGIN: "SESSION_REPLACED_BY_NEW_LOGIN",
  // Issued by the BFF itself when the refresh cookie is absent.
  NO_SESSION: "NO_SESSION",
} as const;

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  validation: "Some of the information you entered is not valid.",
  unauthorized: "You need to sign in to continue.",
  forbidden: "You don't have access to do this.",
  not_found: "We couldn't find what you were looking for.",
  conflict: "This conflicts with an existing record.",
  throttled: "Too many attempts. Please wait a moment and try again.",
  server: "Something went wrong on our side. Please try again.",
  network:
    "We couldn't reach the server, so we can't confirm whether this went through.",
  unknown: "Something unexpected happened.",
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly messages: string[];
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    kind: ApiErrorKind;
    status: number | null;
    code?: string | null;
    messages?: string[];
    retryAfterSeconds?: number | null;
  }) {
    const messages = init.messages ?? [];
    super(messages[0] ?? DEFAULT_MESSAGES[init.kind]);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code ?? null;
    this.messages = messages;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function hasCode(error: unknown, code: string): boolean {
  return isApiError(error) && error.code === code;
}

export function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "throttled";
  if (status >= 500) return "server";
  return "unknown";
}

function extractMessages(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return [message];
  if (Array.isArray(message)) {
    return message.filter((m): m is string => typeof m === "string");
  }
  return [];
}

function extractCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const details = (body as { details?: unknown }).details;
  if (typeof details !== "object" || details === null) return null;
  const code = (details as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function parseRetryAfter(headers?: Headers): number | null {
  if (!headers) return null;
  const values = [
    "retry-after",
    "x-ratelimit-reset-ip",
    "x-ratelimit-reset-email",
  ]
    .map((name) => headers.get(name))
    .map((v) => (v === null ? Number.NaN : Number.parseInt(v, 10)))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return values.length > 0 ? Math.max(...values) : null;
}

/** Build an ApiError from an HTTP error response. Tolerates any body shape. */
export function normalizeErrorResponse(
  status: number,
  body: unknown,
  headers?: Headers,
): ApiError {
  const kind = kindFromStatus(status);
  return new ApiError({
    kind,
    status,
    code: extractCode(body),
    messages: extractMessages(body),
    retryAfterSeconds: kind === "throttled" ? parseRetryAfter(headers) : null,
  });
}

/** The request never produced a response: the outcome is unknown. */
export function networkError(): ApiError {
  return new ApiError({ kind: "network", status: null });
}

/**
 * Map validation message strings onto form fields. The backend returns plain
 * strings that begin with the property name ("lastName should not be empty",
 * "Password must be at least 8 characters long"). Anything that does not start
 * with a known field name is returned as a general error.
 */
export function toFieldErrors(
  messages: readonly string[],
  fields: readonly string[],
): { fields: Record<string, string[]>; general: string[] } {
  const byLowerName = new Map(fields.map((f) => [f.toLowerCase(), f]));
  const result: { fields: Record<string, string[]>; general: string[] } = {
    fields: {},
    general: [],
  };
  for (const message of messages) {
    const firstToken = message.split(" ")[0]?.toLowerCase() ?? "";
    const field = byLowerName.get(firstToken);
    if (field) {
      (result.fields[field] ??= []).push(message);
    } else {
      result.general.push(message);
    }
  }
  return result;
}
