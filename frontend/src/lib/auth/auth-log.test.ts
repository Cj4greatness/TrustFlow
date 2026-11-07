import { describe, expect, it, vi } from "vitest";
import {
  classifyRefreshFailure,
  formatAuthLog,
  logAuthEvent,
  type AuthLogFields,
} from "./auth-log";

const NOW = new Date("2026-11-01T10:00:00.000Z");

describe("formatAuthLog", () => {
  it("writes one JSON line with only the allowed fields", () => {
    const line = formatAuthLog(
      {
        event: "refresh_rejected",
        status: 401,
        code: "SESSION_REPLACED_BY_NEW_LOGIN",
      },
      NOW,
    );
    expect(JSON.parse(line)).toEqual({
      ts: "2026-11-01T10:00:00.000Z",
      scope: "auth",
      event: "refresh_rejected",
      status: 401,
      code: "SESSION_REPLACED_BY_NEW_LOGIN",
    });
    expect(line).not.toContain("\n");
  });

  it("cannot carry secrets, because extra fields are ignored", () => {
    const sneaky = {
      event: "refresh_rejected",
      status: 401,
      accessToken: "at-secret",
      refreshToken: "rt-secret",
      cookie: "tf_refresh=rt-secret",
      body: { password: "pw" },
    } as unknown as AuthLogFields;
    const line = formatAuthLog(sneaky, NOW);
    expect(line).not.toMatch(/secret|tf_refresh|password/);
    expect(Object.keys(JSON.parse(line)).sort()).toEqual([
      "event",
      "scope",
      "status",
      "ts",
    ]);
  });

  it("drops a code that does not look like an error code", () => {
    const bad = [
      "Bearer abc.def.ghi",
      "lowercase_code",
      "HAS SPACE",
      "X".repeat(65),
      "",
      null,
    ];
    for (const code of bad) {
      const parsed = JSON.parse(
        formatAuthLog({ event: "refresh_rejected", code }, NOW),
      );
      expect(parsed).not.toHaveProperty("code");
    }
  });

  it("keeps only integer statuses", () => {
    const ok = JSON.parse(
      formatAuthLog({ event: "refresh_throttled", status: 429 }, NOW),
    );
    expect(ok.status).toBe(429);
    for (const status of [1.5, Number.NaN, null, undefined]) {
      const parsed = JSON.parse(
        formatAuthLog({ event: "refresh_throttled", status }, NOW),
      );
      expect(parsed).not.toHaveProperty("status");
    }
  });
});

describe("classifyRefreshFailure", () => {
  it("names a lost rotation race", () => {
    expect(classifyRefreshFailure(401, "REFRESH_TOKEN_RECENTLY_ROTATED")).toBe(
      "refresh_rotation_race",
    );
  });

  it("does not call other rejections a race or a reuse", () => {
    expect(classifyRefreshFailure(401, "SESSION_REPLACED_BY_NEW_LOGIN")).toBe(
      "refresh_rejected",
    );
    expect(classifyRefreshFailure(401, null)).toBe("refresh_rejected");
    expect(classifyRefreshFailure(403)).toBe("refresh_rejected");
  });

  it("separates throttling and server errors", () => {
    expect(classifyRefreshFailure(429, null)).toBe("refresh_throttled");
    expect(classifyRefreshFailure(500)).toBe("refresh_server_error");
    expect(classifyRefreshFailure(503, null)).toBe("refresh_server_error");
  });
});

describe("logAuthEvent", () => {
  it("sends the formatted line to the sink", () => {
    const sink = vi.fn();
    logAuthEvent({ event: "refresh_throttled", status: 429 }, sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sink.mock.calls[0][0])).toMatchObject({
      scope: "auth",
      event: "refresh_throttled",
      status: 429,
    });
  });

  it("never throws, even if the sink does", () => {
    expect(() =>
      logAuthEvent({ event: "refresh_rejected" }, () => {
        throw new Error("disk full");
      }),
    ).not.toThrow();
  });

  it("ignores an event name outside the fixed list", () => {
    const sink = vi.fn();
    logAuthEvent(
      { event: "login_failed_for_bob@example.com" } as unknown as AuthLogFields,
      sink,
    );
    expect(sink).not.toHaveBeenCalled();
  });
});
