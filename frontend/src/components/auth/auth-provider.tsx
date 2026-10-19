"use client";

// Connects the browser auth client to React. The reducer holds who is signed
// in (the user profile only, never the access token). bootstrap() runs on
// load, so state stays "loading" until the cookie session is resolved and
// protected content never flashes. A failed bootstrap is "unavailable", never
// "signed out", because the outcome is unknown.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { getBrowserAuth } from "@/lib/auth/browser";
import type { Credentials, RegisterInput } from "@/lib/auth/browser-auth";
import {
  authReducer,
  initialAuthState,
  type AuthState,
} from "@/lib/auth/auth-state";

type AuthContextValue = {
  state: AuthState;
  login: (credentials: Credentials) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Throws if the logout request could not be sent; the local session is cleared either way. */
  logout: () => Promise<{ backendSessionEnded: boolean }>;
  /** Try bootstrap again after the server could not be reached. */
  retry: () => void;
  dismissNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const { auth, onSessionEnded } = getBrowserAuth();
    const unsubscribe = onSessionEnded((reason) => {
      dispatch({ type: "sessionEnded", reason });
    });
    // Strict Mode runs this effect twice in development; the session manager
    // shares one in-flight refresh, so this cannot cause a second refresh.
    auth.bootstrap().then(
      (session) => {
        if (!cancelled) dispatch({ type: "bootstrapped", session });
      },
      () => {
        if (!cancelled) dispatch({ type: "bootstrapFailed" });
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt]);

  const login = useCallback(async (credentials: Credentials) => {
    const session = await getBrowserAuth().auth.login(credentials);
    dispatch({ type: "signedIn", session });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await getBrowserAuth().auth.register(input);
    dispatch({ type: "signedIn", session });
  }, []);

  const logout = useCallback(async () => {
    try {
      return await getBrowserAuth().auth.logout();
    } finally {
      dispatch({ type: "signedOut" });
    }
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: "bootstrapRetried" });
    setAttempt((n) => n + 1);
  }, []);

  const dismissNotice = useCallback(() => {
    dispatch({ type: "noticeDismissed" });
  }, []);

  const value = useMemo(
    () => ({ state, login, register, logout, retry, dismissNotice }),
    [state, login, register, logout, retry, dismissNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}
