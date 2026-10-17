import { describe, expect, it, vi } from "vitest";
import { createBrowserAuth } from "./browser";
import type { LockManagerLike } from "./cross-tab-lock";
import { REFRESH_LOCK_NAME } from "./session-manager";
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

const creds = { email: "ada@example.com", password: "secret-pass-1" };
const API = "http://api.test";

function setup(responses: Response[]) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) fetchFn.mockResolvedValueOnce(r);
  const lockRequests: string[] = [];
  const locks: LockManagerLike = {
    request: (name, callback) => {
      lockRequests.push(name);
      return callback();
    },
  };
  const browser = createBrowserAuth({ apiUrl: API, locks, fetchFn });
  return { fetchFn, lockRequests, browser };
}

function authHeader(
  fetchFn: ReturnType<typeof vi.fn<typeof fetch>>,
  i: number,
) {
  const headers = fetchFn.mock.calls[i][1]?.headers as Record<string, string>;
  return headers.Authorization;
}

describe("createBrowserAuth", () => {
  it("runs refresh through the cross-tab lock", async () => {
    const { lockRequests, browser } = setup([json(200, makeSession("at-1"))]);
    await browser.auth.refresh();
    expect(lockRequests).toEqual([REFRESH_LOCK_NAME]);
  });

  it("sends the in-memory access token on API calls", async () => {
    const { fetchFn, browser } = setup([
      json(200, makeSession("at-1")),
      json(200, { ok: true }),
    ]);
    await browser.auth.login(creds);
    await browser.api.get("/things");

    expect(fetchFn.mock.calls[1][0]).toBe(`${API}/things`);
    expect(authHeader(fetchFn, 1)).toBe("Bearer at-1");
  });

  it("refreshes once and replays the request once on a 401", async () => {
    const { fetchFn, browser } = setup([
      json(200, makeSession("at-1")),
      json(401, { success: false, message: "Unauthorized", statusCode: 401 }),
      json(200, makeSession("at-2")),
      json(200, { ok: true }),
    ]);
    await browser.auth.login(creds);
    const result = await browser.api.get<{ ok: boolean }>("/things");

    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[2][0]).toBe("/api/auth/refresh");
    expect(fetchFn.mock.calls[3][0]).toBe(`${API}/things`);
    expect(authHeader(fetchFn, 3)).toBe("Bearer at-2");
  });

  it("notifies subscribers when a session ends, until they unsubscribe", async () => {
    const { browser } = setup([
      json(200, makeSession("at-1")),
      json(401, { success: false, message: "Expired", statusCode: 401 }),
    ]);
    const kept = vi.fn();
    const removed = vi.fn();
    browser.onSessionEnded(kept);
    const unsubscribe = browser.onSessionEnded(removed);
    unsubscribe();

    await browser.auth.login(creds);
    await expect(browser.auth.refresh()).rejects.toMatchObject({
      kind: "unauthorized",
    });

    expect(kept).toHaveBeenCalledWith("expired");
    expect(removed).not.toHaveBeenCalled();
  });
});
