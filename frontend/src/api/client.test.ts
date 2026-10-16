import { describe, expect, it, vi } from "vitest";
import { createSessionManager } from "../lib/auth/session-manager";
import type { Session } from "../lib/auth/types";
import { createApiClient, buildUrl, type ApiClientOptions } from "./client";
import { ApiError } from "./errors";

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more fake responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchFn, calls };
}

function make(
  fetchFn: typeof fetch,
  overrides: Partial<ApiClientOptions> = {},
) {
  return createApiClient({
    baseUrl: "http://api.test/",
    getAccessToken: () => "tok",
    refreshSession: async () => ({ accessToken: "fresh" }),
    fetchFn,
    ...overrides,
  });
}

const authHeader = (init: RequestInit) =>
  new Headers(init.headers).get("authorization");

const sessionOf = (accessToken: string): Session => ({
  accessToken,
  user: {
    id: "u1",
    firstName: "Dev",
    lastName: "Tester",
    email: "dev.tester@example.com",
    phone: null,
    avatar: null,
    status: "active",
    emailVerified: false,
    lastLogin: null,
    createdAt: "2026-10-15T18:57:33.122Z",
  },
});

describe("buildUrl", () => {
  it("joins base and path and skips undefined query values", () => {
    expect(
      buildUrl("http://api.test/", "/x", { a: 1, b: undefined, c: true }),
    ).toBe("http://api.test/x?a=1&c=true");
  });

  it("encodes query values", () => {
    expect(buildUrl("http://api.test", "/x", { search: "a b&c" })).toBe(
      "http://api.test/x?search=a+b%26c",
    );
  });

  it("rejects paths that do not start with a slash", () => {
    expect(() => buildUrl("http://api.test", "x")).toThrow();
  });
});

describe("api client requests", () => {
  it("sends the bearer token, JSON body, query, and no cookies", async () => {
    const { fetchFn, calls } = fakeFetch([json(200, { ok: true })]);
    const client = make(fetchFn);

    await client.post("/organizations/o1/customers", {
      query: { page: 2, search: undefined, active: true },
      body: { customerType: "individual" },
    });

    const [call] = calls;
    expect(call.url).toBe(
      "http://api.test/organizations/o1/customers?page=2&active=true",
    );
    expect(call.init.method).toBe("POST");
    expect(authHeader(call.init)).toBe("Bearer tok");
    expect(new Headers(call.init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(call.init.body).toBe(JSON.stringify({ customerType: "individual" }));
    expect(call.init.credentials).toBe("omit");
  });

  it("sends no content type on a GET and returns the parsed body", async () => {
    const { fetchFn, calls } = fakeFetch([json(200, { id: "c1" })]);
    const result = await make(fetchFn).get<{ id: string }>("/x");
    expect(result).toEqual({ id: "c1" });
    expect(new Headers(calls[0].init.headers).get("content-type")).toBeNull();
  });

  it("returns undefined for an empty 204 response", async () => {
    const { fetchFn } = fakeFetch([new Response(null, { status: 204 })]);
    expect(await make(fetchFn).delete("/x")).toBeUndefined();
  });

  it("turns error responses into ApiError with the backend details", async () => {
    const { fetchFn } = fakeFetch([
      json(403, { message: "Forbidden resource", statusCode: 403 }),
      json(400, {
        message: ["email must be an email", "name should not be empty"],
      }),
    ]);
    const client = make(fetchFn);

    await expect(client.get("/a")).rejects.toMatchObject({ kind: "forbidden" });
    await expect(client.get("/b")).rejects.toMatchObject({
      kind: "validation",
      messages: ["email must be an email", "name should not be empty"],
    });
  });

  it("treats a malformed JSON success body as an unknown error", async () => {
    const { fetchFn } = fakeFetch([new Response("<html>", { status: 200 })]);
    await expect(make(fetchFn).get("/x")).rejects.toMatchObject({
      kind: "unknown",
    });
  });
});

describe("refresh and replay on 401", () => {
  it("refreshes once and replays the same request with the new token", async () => {
    const refreshSession = vi.fn(async () => ({ accessToken: "fresh" }));
    const { fetchFn, calls } = fakeFetch([
      json(401, { message: "Unauthorized", statusCode: 401 }),
      json(200, { id: "c1" }),
    ]);

    const result = await make(fetchFn, { refreshSession }).post<{ id: string }>(
      "/x",
      { body: { a: 1 } },
    );

    expect(result).toEqual({ id: "c1" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(authHeader(calls[0].init)).toBe("Bearer tok");
    expect(authHeader(calls[1].init)).toBe("Bearer fresh");
    expect(calls[1].init.body).toBe(calls[0].init.body);
  });

  it("surfaces a failed refresh and does not replay", async () => {
    const failure = new ApiError({
      kind: "unauthorized",
      status: 401,
      code: "SESSION_REPLACED_BY_NEW_LOGIN",
    });
    const refreshSession = vi.fn(async () => {
      throw failure;
    });
    const { fetchFn, calls } = fakeFetch([json(401, {})]);

    await expect(make(fetchFn, { refreshSession }).get("/x")).rejects.toBe(
      failure,
    );
    expect(calls).toHaveLength(1);
  });

  it("does not loop when the replay is also a 401", async () => {
    const refreshSession = vi.fn(async () => ({ accessToken: "fresh" }));
    const { fetchFn, calls } = fakeFetch([json(401, {}), json(401, {})]);

    await expect(
      make(fetchFn, { refreshSession }).get("/x"),
    ).rejects.toMatchObject({ kind: "unauthorized" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it("shares one refresh between concurrent requests (real session manager)", async () => {
    const callRefresh = vi.fn(async () => sessionOf("fresh"));
    const manager = createSessionManager({ callRefresh, onEnded: vi.fn() });
    manager.setSession(sessionOf("stale"));

    const fetchFn: typeof fetch = async (_url, init) =>
      authHeader(init ?? {}) === "Bearer fresh"
        ? json(200, { ok: true })
        : json(401, { message: "Unauthorized" });

    const client = createApiClient({
      baseUrl: "http://api.test",
      getAccessToken: () => manager.getAccessToken(),
      refreshSession: () => manager.refresh(),
      fetchFn,
    });

    const results = await Promise.all([client.get("/a"), client.get("/b")]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(callRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("failures that must not be retried", () => {
  it("reports a network failure as unknown outcome, with no retry or refresh", async () => {
    const refreshSession = vi.fn(async () => ({ accessToken: "fresh" }));
    const { fetchFn, calls } = fakeFetch([new TypeError("fetch failed")]);

    await expect(
      make(fetchFn, { refreshSession }).post("/x"),
    ).rejects.toMatchObject({ kind: "network" });
    expect(calls).toHaveLength(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("does not retry a 5xx response", async () => {
    const refreshSession = vi.fn(async () => ({ accessToken: "fresh" }));
    const { fetchFn, calls } = fakeFetch([json(500, { message: "boom" })]);

    await expect(
      make(fetchFn, { refreshSession }).post("/x"),
    ).rejects.toMatchObject({ kind: "server" });
    expect(calls).toHaveLength(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("rethrows an abort untouched instead of calling it a network error", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const { fetchFn } = fakeFetch([abort]);

    await expect(make(fetchFn).get("/x")).rejects.toBe(abort);
  });
});
