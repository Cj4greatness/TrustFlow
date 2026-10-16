import { describe, expect, it } from "vitest";
import {
  forwardedRateLimitHeaders,
  pickFields,
  sanitizeErrorBody,
  splitAuthResponse,
} from "./bff-helpers";

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

describe("splitAuthResponse", () => {
  it("separates the refresh token from the session sent to the browser", () => {
    const result = splitAuthResponse({
      user,
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(result?.refreshToken).toBe("refresh");
    expect(result?.session.accessToken).toBe("access");
    expect(result?.session.user.id).toBe("u1");
    expect(JSON.stringify(result?.session)).not.toContain("refresh");
  });

  it("returns null for untrusted shapes", () => {
    expect(splitAuthResponse(null)).toBeNull();
    expect(splitAuthResponse("nope")).toBeNull();
    expect(splitAuthResponse({ user, refreshToken: "r" })).toBeNull();
    expect(splitAuthResponse({ user, accessToken: "a" })).toBeNull();
    expect(
      splitAuthResponse({ user, accessToken: "a", refreshToken: "" }),
    ).toBeNull();
    expect(
      splitAuthResponse({ user: "x", accessToken: "a", refreshToken: "r" }),
    ).toBeNull();
    expect(
      splitAuthResponse({
        user: { id: 1 },
        accessToken: "a",
        refreshToken: "r",
      }),
    ).toBeNull();
  });
});

describe("pickFields", () => {
  it("keeps only the allowed fields", () => {
    expect(
      pickFields({ email: "a@b.co", password: "x", role: "owner", extra: 1 }, [
        "email",
        "password",
      ]),
    ).toEqual({ email: "a@b.co", password: "x" });
  });

  it("returns an empty object for non-object bodies", () => {
    expect(pickFields(null, ["email"])).toEqual({});
    expect(pickFields("text", ["email"])).toEqual({});
    expect(pickFields([1, 2], ["email"])).toEqual({});
  });

  it("does not pick inherited or undefined values", () => {
    expect(pickFields({ email: undefined }, ["email", "toString"])).toEqual({});
  });
});

describe("sanitizeErrorBody", () => {
  it("keeps message, status, and details.code only", () => {
    const result = sanitizeErrorBody(401, {
      success: false,
      message: "Refresh token was already rotated by a concurrent request",
      statusCode: 401,
      timestamp: "2026-10-15T19:00:25.827Z",
      path: "/auth/refresh",
      details: { code: "REFRESH_TOKEN_RECENTLY_ROTATED", internal: "secret" },
    });
    expect(result).toEqual({
      success: false,
      message: "Refresh token was already rotated by a concurrent request",
      statusCode: 401,
      details: { code: "REFRESH_TOKEN_RECENTLY_ROTATED" },
    });
  });

  it("keeps validation message arrays and drops non-strings", () => {
    const result = sanitizeErrorBody(400, {
      message: ["email must be an email", 42, "Password too short"],
    });
    expect(result.message).toEqual([
      "email must be an email",
      "Password too short",
    ]);
  });

  it("falls back to a generic message for unusable bodies", () => {
    expect(sanitizeErrorBody(500, null).message).toBe("Request failed");
    expect(sanitizeErrorBody(500, "<html>").message).toBe("Request failed");
    expect(sanitizeErrorBody(500, { message: 5 }).message).toBe(
      "Request failed",
    );
    expect(sanitizeErrorBody(500, null).statusCode).toBe(500);
  });
});

describe("forwardedRateLimitHeaders", () => {
  it("passes through rate-limit and retry-after headers only", () => {
    const headers = new Headers({
      "X-RateLimit-Limit-ip": "5",
      "X-RateLimit-Reset-email": "749",
      "Retry-After": "30",
      "Set-Cookie": "secret=1",
      "Content-Type": "application/json",
    });
    expect(forwardedRateLimitHeaders(headers)).toEqual({
      "x-ratelimit-limit-ip": "5",
      "x-ratelimit-reset-email": "749",
      "retry-after": "30",
    });
  });
});
