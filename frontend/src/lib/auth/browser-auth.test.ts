import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./browser-auth";
import type { Session } from "./types";

function makeSession(accessToken: string): Session {
  return {
    accessToken,
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
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function errorBody(status: number, message: string, code?: string) {
  return {
    success: false,
    message,
    statusCode: status,
    ...(code ? { details: { code } } : {}),
  };
}

function setup(responses: Array<Response | Error>) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) {
    if (r instanceof Error) fetchFn.mockRejectedValueOnce(r);
    else fetchFn.mockResolvedValueOnce(r);
  }
  const onSessionEnded = vi.fn();
  const auth = createAuthClient({
    fetchFn,
    onSessionEnded,
    wait: async () => {},
  });
  return { fetchFn, onSessionEnded, auth };
}

function callHeaders(
  fetchFn: ReturnType<typeof vi.fn<typeof fetch>>,
  i: number,
) {
  return fetchFn.mock.calls[i][1]?.headers as Record<string, string>;
}

const creds = { email: "ada@example.com", password: "secret-pass-1" };

describe("login and register", () => {
  it("login posts credentials with the CSRF header and stores the session", async () => {
    const { fetchFn, auth } = setup([json(200, makeSession("at-1"))]);
    const session = await auth.login(creds);

    expect(session.accessToken).toBe("at-1");
    expect(auth.getAccessToken()).toBe("at-1");
    expect(fetchFn.mock.calls[0][0]).toBe("/api/auth/login");
    const init = fetchFn.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(init?.body as string)).toEqual(creds);
    const headers = callHeaders(fetchFn, 0);
    expect(headers["x-trustflow-csrf"]).toBe("1");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("register posts to the register route and stores the session", async () => {
    const { fetchFn, auth } = setup([json(201, makeSession("at-r"))]);
    await auth.register({ email: "a@b.co", password: "x" });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/auth/register");
    expect(auth.getAccessToken()).toBe("at-r");
  });

  it("a rejected login throws an ApiError and leaves no session", async () => {
    const { auth } = setup([json(401, errorBody(401, "Invalid credentials"))]);
    await expect(auth.login(creds)).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
    expect(auth.getSession()).toBeNull();
  });

  it("a throttled login carries retryAfterSeconds", async () => {
    const { auth } = setup([
      json(429, errorBody(429, "Too many"), { "retry-after": "30" }),
    ]);
    await expect(auth.login(creds)).rejects.toMatchObject({
      kind: "throttled",
      retryAfterSeconds: 30,
    });
  });

  it("a 200 without a valid session is an unknown error", async () => {
    const { auth } = setup([json(200, { hello: "world" })]);
    await expect(auth.login(creds)).rejects.toMatchObject({ kind: "unknown" });
    expect(auth.getSession()).toBeNull();
  });
});

describe("bootstrap", () => {
  it("restores the session from the cookie", async () => {
    const { fetchFn, auth, onSessionEnded } = setup([
      json(200, makeSession("at-b")),
    ]);
    const session = await auth.bootstrap();
    expect(session?.accessToken).toBe("at-b");
    expect(fetchFn.mock.calls[0][0]).toBe("/api/auth/refresh");
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("returns null quietly when nobody is signed in", async () => {
    const { auth, onSessionEnded } = setup([
      json(401, errorBody(401, "Not signed in.", "NO_SESSION")),
    ]);
    await expect(auth.bootstrap()).resolves.toBeNull();
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("reports a replaced session even on page load", async () => {
    const { auth, onSessionEnded } = setup([
      json(
        401,
        errorBody(401, "Signed in elsewhere", "SESSION_REPLACED_BY_NEW_LOGIN"),
      ),
    ]);
    await expect(auth.bootstrap()).resolves.toBeNull();
    expect(onSessionEnded).toHaveBeenCalledWith("replaced");
  });

  it("throws on network errors instead of treating them as signed out", async () => {
    const { auth, onSessionEnded } = setup([new TypeError("Failed to fetch")]);
    await expect(auth.bootstrap()).rejects.toMatchObject({ kind: "network" });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("retries a lost rotation race and then succeeds", async () => {
    const { fetchFn, auth } = setup([
      json(401, errorBody(401, "Rotated", "REFRESH_TOKEN_RECENTLY_ROTATED")),
      json(200, makeSession("at-retry")),
    ]);
    const session = await auth.bootstrap();
    expect(session?.accessToken).toBe("at-retry");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("session end", () => {
  it("reports expiry when an existing session fails to refresh", async () => {
    const { auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      json(401, errorBody(401, "Expired")),
    ]);
    await auth.login(creds);
    await expect(auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledWith("expired");
    expect(auth.getSession()).toBeNull();
  });
});

describe("logout", () => {
  it("refreshes first, then logs out with the fresh token", async () => {
    const { fetchFn, auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      json(200, makeSession("at-2")),
      json(200, { backendSessionEnded: true }),
    ]);
    await auth.login(creds);
    const result = await auth.logout();

    expect(result).toEqual({ backendSessionEnded: true });
    expect(fetchFn.mock.calls[1][0]).toBe("/api/auth/refresh");
    expect(fetchFn.mock.calls[2][0]).toBe("/api/auth/logout");
    expect(callHeaders(fetchFn, 2).Authorization).toBe("Bearer at-2");
    expect(auth.getSession()).toBeNull();
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("still logs out with the previous token when the refresh fails, without a session-ended notice", async () => {
    const { fetchFn, auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      json(401, errorBody(401, "Expired")),
      json(200, { backendSessionEnded: false }),
    ]);
    await auth.login(creds);
    const result = await auth.logout();

    expect(result).toEqual({ backendSessionEnded: false });
    expect(callHeaders(fetchFn, 2).Authorization).toBe("Bearer at-1");
    expect(auth.getSession()).toBeNull();
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("clears the local session but throws when the logout request cannot be sent", async () => {
    const { auth } = setup([
      json(200, makeSession("at-1")),
      json(200, makeSession("at-2")),
      new TypeError("Failed to fetch"),
    ]);
    await auth.login(creds);
    await expect(auth.logout()).rejects.toMatchObject({ kind: "network" });
    expect(auth.getSession()).toBeNull();
  });
});
