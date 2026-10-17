// Holds the in-memory session and serialises refreshes.
//
// - One refresh in flight per tab; concurrent callers share it.
// - Across tabs, refreshes run one at a time through the injected lock
//   (Web Locks in the browser).
// - REFRESH_TOKEN_RECENTLY_ROTATED is non-destructive: we lost a race, so wait
//   briefly (the winner's response has set the new cookie) and try again, up
//   to the number of delays configured (two by default). If it is still
//   rotated, the error is thrown and the session is untouched.
// - SESSION_REPLACED_BY_NEW_LOGIN and any other refresh 401 end the session.
// - Network and server errors never end the session: the outcome is unknown.
// - A failed refresh is never retried automatically, so it cannot loop.

import { AUTH_ERROR_CODES, hasCode, isApiError } from "../../api/errors";
import type { RunExclusive } from "./cross-tab-lock";
import { createSingleFlight } from "./single-flight";
import type { Session } from "./types";

export type SessionEndReason = "expired" | "replaced";

export type SessionManagerOptions = {
  callRefresh: () => Promise<Session>;
  onEnded: (reason: SessionEndReason) => void;
  wait?: (ms: number) => Promise<void>;
  /** Delay before each bounded retry after REFRESH_TOKEN_RECENTLY_ROTATED. */
  rotatedRetryDelaysMs?: readonly number[];
  /** Serialises refreshes across tabs. Defaults to running directly. */
  runExclusive?: RunExclusive;
};

const DEFAULT_ROTATED_RETRY_DELAYS_MS: readonly number[] = [400, 1200];
const FLIGHT_KEY = "session";
export const REFRESH_LOCK_NAME = "trustflow-session-refresh";

export function createSessionManager(options: SessionManagerOptions) {
  const { callRefresh, onEnded } = options;
  const wait =
    options.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retryDelays =
    options.rotatedRetryDelaysMs ?? DEFAULT_ROTATED_RETRY_DELAYS_MS;
  const runExclusive: RunExclusive =
    options.runExclusive ?? ((_name, task) => task());
  const flight = createSingleFlight<Session>();
  let session: Session | null = null;

  async function refreshWithRotationRetry(): Promise<Session> {
    let retries = 0;
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
        const delay = retryDelays[retries];
        if (rotated && delay !== undefined) {
          retries += 1;
          await wait(delay);
          continue;
        }
        throw error;
      }
    }
  }

  async function refreshAndClassify(): Promise<Session> {
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
      return flight(FLIGHT_KEY, () =>
        runExclusive(REFRESH_LOCK_NAME, refreshAndClassify),
      );
    },
  };
}
