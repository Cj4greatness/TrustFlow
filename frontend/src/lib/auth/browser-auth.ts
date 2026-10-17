// Browser-side client for the four BFF auth routes (same-origin /api/auth/*).
//
// - Every call carries the CSRF header and uses same-origin credentials, so
//   the HttpOnly refresh cookie travels automatically and is never readable.
// - Success becomes a Session; any failure becomes an ApiError.
// - refresh() runs through the session manager: single flight per tab, one at
//   a time across tabs, bounded retry on REFRESH_TOKEN_RECENTLY_ROTATED.
// - bootstrap() restores the session on page load. "Nobody is signed in" is a
//   normal outcome and returns null without telling the UI the session ended.
//   Network, server and throttling errors are thrown, never treated as
//   "signed out", because the outcome is unknown.
// - logout() refreshes first for a fresh access token (design doc section 6),
//   then calls the BFF. The local session is always cleared.

import {
  ApiError,
  AUTH_ERROR_CODES,
  hasCode,
  isApiError,
  networkError,
  normalizeErrorResponse,
} from "../../api/errors";
import type { RunExclusive } from "./cross-tab-lock";
import { CSRF_HEADER, CSRF_HEADER_VALUE } from "./csrf";
import { createSessionManager, type SessionEndReason } from "./session-manager";
import type { Session } from "./types";

export type Credentials = { email: string; password: string };
// Loosely typed until the register screen exists; the BFF filters the fields.
export type RegisterInput = Record<string, unknown>;

export type AuthClientOptions = {
  /** Called when a session that existed has ended (expired or replaced). */
  onSessionEnded: (reason: SessionEndReason) => void;
  fetchFn?: typeof fetch;
  runExclusive?: RunExclusive;
  wait?: (ms: number) => Promise<void>;
  rotatedRetryDelaysMs?: readonly number[];
};

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const { accessToken, user } = value as {
    accessToken?: unknown;
    user?: unknown;
  };
  return (
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    typeof user === "object" &&
    user !== null
  );
}

async function readBody(
  response: Response,
): Promise<{ body: unknown; parseFailed: boolean }> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw networkError();
  }
  if (!text) return { body: undefined, parseFailed: false };
  try {
    return { body: JSON.parse(text), parseFailed: false };
  } catch {
    return { body: undefined, parseFailed: true };
  }
}

export function createAuthClient(options: AuthClientOptions) {
  const fetchFn: typeof fetch =
    options.fetchFn ?? ((input, init) => fetch(input, init));
  let hadSession = false;
  let signingOut = false;

  async function post(
    route: string,
    init: { body?: unknown; authorization?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
    };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.authorization) headers.Authorization = init.authorization;

    let response: Response;
    try {
      response = await fetchFn(`/api/auth/${route}`, {
        method: "POST",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      throw networkError();
    }

    const { body, parseFailed } = await readBody(response);
    if (!response.ok) {
      throw normalizeErrorResponse(
        response.status,
        parseFailed ? null : body,
        response.headers,
      );
    }
    if (parseFailed) {
      throw new ApiError({ kind: "unknown", status: response.status });
    }
    return { status: response.status, body };
  }

  async function postForSession(
    route: string,
    body?: unknown,
  ): Promise<Session> {
    const result = await post(route, { body });
    if (!isSession(result.body)) {
      throw new ApiError({ kind: "unknown", status: result.status });
    }
    return result.body;
  }

  const manager = createSessionManager({
    callRefresh: async () => {
      const session = await postForSession("refresh");
      hadSession = true;
      return session;
    },
    onEnded: (reason) => {
      const quiet = signingOut || (reason === "expired" && !hadSession);
      hadSession = false;
      if (!quiet) options.onSessionEnded(reason);
    },
    wait: options.wait,
    rotatedRetryDelaysMs: options.rotatedRetryDelaysMs,
    runExclusive: options.runExclusive,
  });

  async function signIn(route: string, body: unknown): Promise<Session> {
    const session = await postForSession(route, body);
    manager.setSession(session);
    hadSession = true;
    return session;
  }

  return {
    login: (credentials: Credentials) => signIn("login", credentials),
    register: (input: RegisterInput) => signIn("register", input),

    async bootstrap(): Promise<Session | null> {
      try {
        return await manager.refresh();
      } catch (error) {
        const signedOut =
          isApiError(error) &&
          error.kind === "unauthorized" &&
          !hasCode(error, AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED);
        if (signedOut) return null;
        throw error;
      }
    },

    async logout(): Promise<{ backendSessionEnded: boolean }> {
      signingOut = true;
      const previousToken = manager.getAccessToken();
      try {
        let token = previousToken;
        try {
          token = (await manager.refresh()).accessToken;
        } catch {
          // Fall back to the token we already had; the BFF still clears the cookie.
        }
        const { body } = await post("logout", {
          authorization: token ? `Bearer ${token}` : undefined,
        });
        const ended =
          typeof body === "object" &&
          body !== null &&
          (body as { backendSessionEnded?: unknown }).backendSessionEnded ===
            true;
        return { backendSessionEnded: ended };
      } finally {
        manager.clear();
        hadSession = false;
        signingOut = false;
      }
    },

    refresh: () => manager.refresh(),
    getSession: manager.getSession,
    getAccessToken: manager.getAccessToken,
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
