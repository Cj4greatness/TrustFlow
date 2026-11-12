"use client";

// Loads the organization the person works in, and their role there, once they
// are signed in. The result is derived while rendering (no state is set
// synchronously inside an effect), so the shell never flashes the wrong screen.
// The chosen organization is remembered per user in localStorage; an id is not
// sensitive, and the code copes with storage being unavailable.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { OrgState } from "@/lib/app/access-state";
import { loadOrgState } from "@/lib/app/org-loader";
import { getBrowserAuth } from "@/lib/auth/browser";

const STORAGE_PREFIX = "trustflow.organization:";

// Shared, so the context value only changes when something really changed.
const IDLE: OrgState = { status: "idle" };
const LOADING: OrgState = { status: "loading" };

function readPreferred(userId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + userId);
  } catch {
    return null;
  }
}

function writePreferred(userId: string, organizationId: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, organizationId);
  } catch {
    // Storage is unavailable; the choice just will not be remembered.
  }
}

type OrgContextValue = {
  state: OrgState;
  /** Load again, for example after a failure. */
  reload: () => void;
  /** Work in another organization and remember the choice. */
  selectOrganization: (organizationId: string) => void;
};

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { state: auth } = useAuth();
  const userId = auth.status === "authenticated" ? auth.user.id : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: OrgState } | null>(
    null,
  );

  const key = userId === null ? null : `${userId}:${attempt}`;
  const state: OrgState =
    key === null
      ? IDLE
      : result !== null && result.key === key
        ? result.state
        : LOADING;

  useEffect(() => {
    if (userId === null) return;
    const loadKey = `${userId}:${attempt}`;
    const controller = new AbortController();
    loadOrgState({
      get: (path, options) => getBrowserAuth().api.get<unknown>(path, options),
      userId,
      preferredOrganizationId: readPreferred(userId),
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setResult({ key: loadKey, state: next });
        }
      })
      .catch(() => {
        // An aborted load (strict-mode double effect, or leaving the page).
      });
    return () => controller.abort();
  }, [userId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const selectOrganization = useCallback(
    (organizationId: string) => {
      if (userId === null) return;
      writePreferred(userId, organizationId);
      setAttempt((n) => n + 1);
    },
    [userId],
  );

  const value = useMemo(
    () => ({ state, reload, selectOrganization }),
    [state, reload, selectOrganization],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used inside <OrgProvider>.");
  }
  return context;
}
