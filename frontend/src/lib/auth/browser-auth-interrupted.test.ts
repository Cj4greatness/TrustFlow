import { describe, expect, it, vi } from "vitest";
import { describeSessionNotice } from "./auth-state";
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

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorBody(status: number, message: string) {
  return { success: false, message, statusCode: status };
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
  return { onSessionEnded, auth };
}

const creds = { email: "ada@example.com", password: "secret-pass-1" };

describe("interrupted sessions", () => {
  it("reports interrupted when an expiry follows a refresh with no answer", async () => {
    const { auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      new TypeError("Failed to fetch"),
      json(401, errorBody(401, "Expired")),
    ]);
    await auth.login(creds);
    await expect(auth.refresh()).rejects.toMatchObject({ kind: "network" });
    expect(onSessionEnded).not.toHaveBeenCalled();
    await expect(auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledWith("interrupted");
  });

  it("also counts a server error as an unknown outcome", async () => {
    const { auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      json(502, errorBody(502, "Could not reach the service")),
      json(401, errorBody(401, "Expired")),
    ]);
    await auth.login(creds);
    await expect(auth.refresh()).rejects.toMatchObject({ kind: "server" });
    await expect(auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(onSessionEnded).toHaveBeenCalledWith("interrupted");
  });

  it("clears the flag after a successful refresh", async () => {
    const { auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      new TypeError("Failed to fetch"),
      json(200, makeSession("at-2")),
      json(401, errorBody(401, "Expired")),
    ]);
    await auth.login(creds);
    await expect(auth.refresh()).rejects.toMatchObject({ kind: "network" });
    await auth.refresh();
    await expect(auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(onSessionEnded).toHaveBeenCalledWith("expired");
  });

  it("does not treat a throttled refresh as an unknown outcome", async () => {
    const { auth, onSessionEnded } = setup([
      json(200, makeSession("at-1")),
      json(429, errorBody(429, "Too many")),
      json(401, errorBody(401, "Expired")),
    ]);
    await auth.login(creds);
    await expect(auth.refresh()).rejects.toMatchObject({ kind: "throttled" });
    await expect(auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(onSessionEnded).toHaveBeenCalledWith("expired");
  });

  it("stays quiet for a visitor who never had a session", async () => {
    const { auth, onSessionEnded } = setup([
      new TypeError("Failed to fetch"),
      json(401, errorBody(401, "Not signed in.")),
    ]);
    await expect(auth.bootstrap()).rejects.toMatchObject({ kind: "network" });
    await expect(auth.bootstrap()).resolves.toBeNull();
    expect(onSessionEnded).not.toHaveBeenCalled();
  });
});

describe("describeSessionNotice", () => {
  it("explains an interrupted session without mentioning tokens", () => {
    const text = describeSessionNotice("interrupted");
    expect(text).toMatch(/connection dropped/);
    expect(text).toMatch(/may have been signed out/);
    expect(text).not.toMatch(/token|reuse|reused|replay/i);
  });

  it("keeps the other two messages distinct", () => {
    expect(describeSessionNotice("expired")).toMatch(/expired/);
    expect(describeSessionNotice("replaced")).toMatch(/another device/);
  });
});
