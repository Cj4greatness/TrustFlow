import { describe, expect, it, vi } from "vitest";
import { ApiError, AUTH_ERROR_CODES } from "../../api/errors";
import { createSessionManager } from "./session-manager";
import type { Session } from "./types";

const user = {
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
};
const sessionWith = (accessToken: string): Session => ({ accessToken, user });

const unauthorized = (code?: string) =>
  new ApiError({ kind: "unauthorized", status: 401, code: code ?? null });
const rotated = () =>
  unauthorized(AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED);
const replaced = () =>
  unauthorized(AUTH_ERROR_CODES.SESSION_REPLACED_BY_NEW_LOGIN);

function setup(callRefresh: () => Promise<Session>) {
  const onEnded = vi.fn();
  const wait = vi.fn(async () => {});
  const manager = createSessionManager({ callRefresh, onEnded, wait });
  return { manager, onEnded, wait };
}

describe("session manager", () => {
  it("shares one refresh between concurrent callers and stores the result", async () => {
    const callRefresh = vi.fn(async () => sessionWith("new"));
    const { manager } = setup(callRefresh);

    const [a, b] = await Promise.all([manager.refresh(), manager.refresh()]);

    expect(callRefresh).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(manager.getAccessToken()).toBe("new");
  });

  it("retries once on RECENTLY_ROTATED without ending the session", async () => {
    const callRefresh = vi
      .fn<() => Promise<Session>>()
      .mockRejectedValueOnce(rotated())
      .mockResolvedValueOnce(sessionWith("after-retry"));
    const { manager, onEnded, wait } = setup(callRefresh);

    await manager.refresh();

    expect(callRefresh).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(400);
    expect(onEnded).not.toHaveBeenCalled();
    expect(manager.getAccessToken()).toBe("after-retry");
  });

  it("stops after one retry and leaves the session untouched when still rotated", async () => {
    const callRefresh = vi.fn(async () => {
      throw rotated();
    });
    const { manager, onEnded } = setup(callRefresh);
    manager.setSession(sessionWith("existing"));

    await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);

    expect(callRefresh).toHaveBeenCalledTimes(2);
    expect(onEnded).not.toHaveBeenCalled();
    expect(manager.getAccessToken()).toBe("existing");
  });

  it("ends the session with the dedicated reason on SESSION_REPLACED_BY_NEW_LOGIN", async () => {
    const callRefresh = vi.fn(async () => {
      throw replaced();
    });
    const { manager, onEnded } = setup(callRefresh);
    manager.setSession(sessionWith("existing"));

    await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);

    expect(callRefresh).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith("replaced");
    expect(manager.getSession()).toBeNull();
  });

  it("ends the session as expired on any other 401", async () => {
    const callRefresh = vi.fn(async () => {
      throw unauthorized();
    });
    const { manager, onEnded } = setup(callRefresh);
    manager.setSession(sessionWith("existing"));

    await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);

    expect(callRefresh).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith("expired");
    expect(manager.getSession()).toBeNull();
  });

  it("does not end the session on network or server errors, and does not retry", async () => {
    for (const kind of ["network", "server"] as const) {
      const callRefresh = vi.fn(async () => {
        throw new ApiError({ kind, status: kind === "network" ? null : 503 });
      });
      const { manager, onEnded } = setup(callRefresh);
      manager.setSession(sessionWith("existing"));

      await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);

      expect(callRefresh).toHaveBeenCalledTimes(1);
      expect(onEnded).not.toHaveBeenCalled();
      expect(manager.getAccessToken()).toBe("existing");
    }
  });

  it("only refreshes again when explicitly asked, never on its own", async () => {
    const callRefresh = vi.fn(async () => {
      throw unauthorized();
    });
    const { manager } = setup(callRefresh);

    await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(callRefresh).toHaveBeenCalledTimes(1);

    await expect(manager.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(callRefresh).toHaveBeenCalledTimes(2);
  });

  it("clear() drops the in-memory session", () => {
    const { manager } = setup(vi.fn(async () => sessionWith("x")));
    manager.setSession(sessionWith("existing"));
    manager.clear();
    expect(manager.getSession()).toBeNull();
    expect(manager.getAccessToken()).toBeNull();
  });
});
