// Wires the browser-side auth pieces together:
//   BFF auth client -> session manager -> cross-tab lock -> typed API client.
//
// createBrowserAuth is the testable factory. getBrowserAuth builds the one
// real instance on first use, in the browser only (it needs window and the
// public API URL).

import { createApiClient } from "../../api/client";
import { createAuthClient } from "./browser-auth";
import {
  browserLockManager,
  createCrossTabLock,
  type LockManagerLike,
} from "./cross-tab-lock";
import type { SessionNotice } from "./auth-state";

export type SessionEndListener = (reason: SessionNotice) => void;

export type BrowserAuthOptions = {
  /** Public API origin the browser calls directly, e.g. http://localhost:4000 */
  apiUrl: string;
  locks?: LockManagerLike | null;
  fetchFn?: typeof fetch;
};

export function createBrowserAuth(options: BrowserAuthOptions) {
  const listeners = new Set<SessionEndListener>();

  const auth = createAuthClient({
    onSessionEnded: (reason) => {
      for (const listener of [...listeners]) listener(reason);
    },
    runExclusive: createCrossTabLock(options.locks),
    fetchFn: options.fetchFn,
  });

  const api = createApiClient({
    baseUrl: options.apiUrl,
    getAccessToken: auth.getAccessToken,
    refreshSession: auth.refresh,
    fetchFn: options.fetchFn,
  });

  return {
    auth,
    api,
    /** Subscribe to "a session that existed has ended". Returns unsubscribe. */
    onSessionEnded(listener: SessionEndListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type BrowserAuth = ReturnType<typeof createBrowserAuth>;

let instance: BrowserAuth | null = null;

export function getBrowserAuth(): BrowserAuth {
  if (typeof window === "undefined") {
    throw new Error("getBrowserAuth() can only be used in the browser.");
  }
  if (!instance) {
    // Must be referenced as process.env.NEXT_PUBLIC_API_URL so Next inlines it.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        "NEXT_PUBLIC_API_URL is not set. Add it to frontend/.env.local (see .env.local.example).",
      );
    }
    instance = createBrowserAuth({ apiUrl, locks: browserLockManager() });
  }
  return instance;
}
