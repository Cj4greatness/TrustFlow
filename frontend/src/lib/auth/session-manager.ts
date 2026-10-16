// Holds the in-memory session and serialises refreshes.
//
// - One refresh in flight per tab; concurrent callers share it.
// - REFRESH_TOKEN_RECENTLY_ROTATED is non-destructive: we lost a race, so wait
//   briefly (the winner's response has set the new cookie) and try once more.
//   If it is still rotated, the error is thrown and the session is untouched.
// - SESSION_REPLACED_BY_NEW_LOGIN and any other refresh 401 end the session.
// - Network and server errors never end the session: the outcome is unknown.
// - A failed refresh is never retried automatically, so it cannot loop.

import { AUTH_ERROR_CODES, hasCode, isApiError } from "../../api/errors";
import { createSingleFlight } from "./single-flight";
import type { Session } from "./types";

export type SessionEndReason = "expired" | "replaced";

export type SessionManagerOptions = {
  callRefresh: () => Promise<Session>;
  onEnded: (reason: SessionEndReason) => void;
  wait?: (ms: number) => Promise<void>;
  rotatedRetryDelayMs?: number;
};

const FLIGHT_KEY = "session";

export function createSessionManager(options: SessionManagerOptions) {
  const { callRefresh, onEnded } = options;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retryDelay = options.rotatedRetryDelayMs ?? 400;
  const flight = createSingleFlight<Session>();
  let session: Session | null = null;

  async function refreshWithRotationRetry(): Promise<Session> {
    let retried = false;
    for (;;) {
      try {
        const next = await callRefresh();
        session = next;
        return next;
      } catch (error) {
        const rotated = hasCode(
          error,
          AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED,
        );
        if (rotated && !retried) {
          retried = true;
          await wait(retryDelay);
          continue;
        }
        throw error;
      }
    }
  }

  return {
    getSession: (): Session | null => session,
    getAccessToken: (): string | null => session?.accessToken ?? null,
    setSession(next: Session): void {
      session = next;
    },
    clear(): void {
      session = null;
    },
    refresh(): Promise<Session> {
      return flight(FLIGHT_KEY, async () => {
        try {
          return await refreshWithRotationRetry();
        } catch (error) {
          if (isApiError(error) && error.kind === "unauthorized") {
            const stillRotated = hasCode(
              error,
              AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED,
            );
            if (!stillRotated) {
              const replaced = hasCode(
                error,
                AUTH_ERROR_CODES.SESSION_REPLACED_BY_NEW_LOGIN,
              );
              session = null;
              onEnded(replaced ? "replaced" : "expired");
            }
          }
          throw error;
        }
      });
    },
  };
}
