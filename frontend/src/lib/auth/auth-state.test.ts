import { describe, expect, it } from "vitest";
import {
  authReducer,
  canShowProtectedContent,
  describeSessionNotice,
  initialAuthState,
  type AuthAction,
  type AuthState,
} from "./auth-state";
import type { Session } from "./types";

const session: Session = {
  accessToken: "at-secret-1",
  user: {
    id: "u1",
    firstName: "Ada",
    lastName: "Obi",
    email: "ada@example.com",
    phone: null,
    avatar: null,
    status: "active",
    emailVerified: true,
    lastLogin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

function run(
  actions: AuthAction[],
  from: AuthState = initialAuthState,
): AuthState {
  return actions.reduce(authReducer, from);
}

describe("authReducer", () => {
  it("starts in loading with no user or notice", () => {
    expect(initialAuthState).toEqual({
      status: "loading",
      user: null,
      notice: null,
    });
  });

  it("authenticates after bootstrap and keeps only the user, never the token", () => {
    const state = run([{ type: "bootstrapped", session }]);
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual(session.user);
    expect(JSON.stringify(state)).not.toContain("at-secret-1");
  });

  it("is anonymous without a notice when bootstrap finds no session", () => {
    expect(run([{ type: "bootstrapped", session: null }])).toEqual({
      status: "anonymous",
      user: null,
      notice: null,
    });
  });

  it("keeps a notice reported while bootstrapping", () => {
    const state = run([
      { type: "sessionEnded", reason: "replaced" },
      { type: "bootstrapped", session: null },
    ]);
    expect(state).toEqual({
      status: "anonymous",
      user: null,
      notice: "replaced",
    });
  });

  it("shows the reason when a session ends", () => {
    const state = run([
      { type: "bootstrapped", session },
      { type: "sessionEnded", reason: "expired" },
    ]);
    expect(state).toEqual({
      status: "anonymous",
      user: null,
      notice: "expired",
    });
  });

  it("signing in clears any notice", () => {
    const state = run([
      { type: "sessionEnded", reason: "expired" },
      { type: "signedIn", session },
    ]);
    expect(state.status).toBe("authenticated");
    expect(state.notice).toBeNull();
  });

  it("signing out is anonymous without a notice", () => {
    const state = run([
      { type: "bootstrapped", session },
      { type: "signedOut" },
    ]);
    expect(state).toEqual({ status: "anonymous", user: null, notice: null });
  });
});

describe("notices and failures", () => {
  it("dismissing clears the notice and keeps the status", () => {
    const state = run([
      { type: "sessionEnded", reason: "replaced" },
      { type: "noticeDismissed" },
    ]);
    expect(state).toEqual({ status: "anonymous", user: null, notice: null });
  });

  it("dismissing does nothing while authenticated", () => {
    const signedIn = run([{ type: "signedIn", session }]);
    expect(authReducer(signedIn, { type: "noticeDismissed" })).toBe(signedIn);
  });

  it("a failed bootstrap is unavailable, never anonymous, and can be retried", () => {
    const state = run([{ type: "bootstrapFailed" }]);
    expect(state).toEqual({ status: "unavailable", user: null, notice: null });
    expect(run([{ type: "bootstrapRetried" }], state)).toEqual(
      initialAuthState,
    );
  });

  it("ignores a retry unless bootstrap had failed", () => {
    const signedIn = run([{ type: "signedIn", session }]);
    expect(authReducer(signedIn, { type: "bootstrapRetried" })).toBe(signedIn);
  });
});

describe("helpers", () => {
  it("words the two notices differently", () => {
    expect(describeSessionNotice("replaced")).toMatch(/another device/);
    expect(describeSessionNotice("expired")).toMatch(/expired/);
  });

  it("allows protected content only when authenticated", () => {
    expect(canShowProtectedContent(initialAuthState)).toBe(false);
    expect(
      canShowProtectedContent(run([{ type: "bootstrapped", session: null }])),
    ).toBe(false);
    expect(canShowProtectedContent(run([{ type: "bootstrapFailed" }]))).toBe(
      false,
    );
    expect(canShowProtectedContent(run([{ type: "signedIn", session }]))).toBe(
      true,
    );
  });
});
