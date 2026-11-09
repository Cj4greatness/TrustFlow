// State machine for "who is signed in", kept free of React so it can be tested
// on its own. The provider feeds it events; screens and route guards read it.
//
// - Only the user profile lives here. The access token stays inside the
//   session manager and never enters React state.
// - "loading" lasts until bootstrap() resolves, so protected content never
//   flashes before authentication is known.
// - "unavailable" means the server could not be reached, so the outcome is
//   unknown. It is never treated as signed out.
// - A notice ("expired" or "replaced") exists only for a session that existed.

import type { SessionEndReason } from "./session-manager";
import type { Session, SessionUser } from "./types";

/**
 * Why a session ended, as shown to the person. "interrupted" is an expiry
 * that followed a refresh whose outcome was unknown (no answer, or a server
 * error), so the person may have been signed out through no fault of their own.
 */
export type SessionNotice = SessionEndReason | "interrupted";

export type AuthNotice = SessionNotice | null;

export type AuthState =
  | { status: "loading"; user: null; notice: null }
  | { status: "authenticated"; user: SessionUser; notice: null }
  | { status: "anonymous"; user: null; notice: AuthNotice }
  | { status: "unavailable"; user: null; notice: null };

export type AuthAction =
  | { type: "bootstrapped"; session: Session | null }
  | { type: "bootstrapFailed" }
  | { type: "bootstrapRetried" }
  | { type: "signedIn"; session: Session }
  | { type: "signedOut" }
  | { type: "sessionEnded"; reason: SessionNotice }
  | { type: "noticeDismissed" };

export const initialAuthState: AuthState = {
  status: "loading",
  user: null,
  notice: null,
};

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "bootstrapped":
      if (action.session) {
        return {
          status: "authenticated",
          user: action.session.user,
          notice: null,
        };
      }
      // A replaced session reports its notice before bootstrap returns null.
      return {
        status: "anonymous",
        user: null,
        notice: state.status === "anonymous" ? state.notice : null,
      };
    case "bootstrapFailed":
      return { status: "unavailable", user: null, notice: null };
    case "bootstrapRetried":
      return state.status === "unavailable" ? initialAuthState : state;
    case "signedIn":
      return {
        status: "authenticated",
        user: action.session.user,
        notice: null,
      };
    case "signedOut":
      return { status: "anonymous", user: null, notice: null };
    case "sessionEnded":
      return { status: "anonymous", user: null, notice: action.reason };
    case "noticeDismissed":
      return state.status === "anonymous" && state.notice
        ? { ...state, notice: null }
        : state;
  }
}

export function describeSessionNotice(reason: SessionNotice): string {
  switch (reason) {
    case "replaced":
      return "You were signed out because your account was signed in on another device.";
    case "interrupted":
      return "Your connection dropped while your session was being renewed, so you may have been signed out. Please sign in again.";
    case "expired":
      return "Your session has expired. Please sign in again.";
  }
}

/** Route guards render protected content only when this is true. */
export function canShowProtectedContent(state: AuthState): boolean {
  return state.status === "authenticated";
}
