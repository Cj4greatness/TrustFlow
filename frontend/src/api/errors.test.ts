import { describe, expect, it } from "vitest";
import {
  ApiError,
  AUTH_ERROR_CODES,
  hasCode,
  kindFromStatus,
  networkError,
  normalizeErrorResponse,
  toFieldErrors,
} from "./errors";

describe("normalizeErrorResponse", () => {
  it("reads a plain 401 body", () => {
    const err = normalizeErrorResponse(401, {
      success: false,
      message: "Invalid email or password",
      statusCode: 401,
      path: "/auth/login",
    });
    expect(err.kind).toBe("unauthorized");
    expect(err.message).toBe("Invalid email or password");
    expect(err.code).toBeNull();
  });

  it("reads the machine-readable code from details.code", () => {
    const err = normalizeErrorResponse(401, {
      success: false,
      message: "Refresh token was already rotated by a concurrent request",
      statusCode: 401,
      details: { code: AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED },
    });
    expect(err.code).toBe("REFRESH_TOKEN_RECENTLY_ROTATED");
    expect(hasCode(err, AUTH_ERROR_CODES.REFRESH_TOKEN_RECENTLY_ROTATED)).toBe(
      true,
    );
    expect(hasCode(err, AUTH_ERROR_CODES.SESSION_REPLACED_BY_NEW_LOGIN)).toBe(
      false,
    );
  });

  it("keeps every validation message when message is an array", () => {
    const err = normalizeErrorResponse(400, {
      success: false,
      message: [
        "email must be an email",
        "Password must be at least 8 characters long",
      ],
      statusCode: 400,
    });
    expect(err.kind).toBe("validation");
    expect(err.messages).toHaveLength(2);
  });

  it("falls back to a friendly default when the body is unusable", () => {
    const err = normalizeErrorResponse(500, "<html>Bad Gateway</html>");
    expect(err.kind).toBe("server");
    expect(err.messages).toEqual([]);
    expect(err.message.length).toBeGreaterThan(0);
    expect(normalizeErrorResponse(403, null).kind).toBe("forbidden");
    expect(normalizeErrorResponse(404, undefined).kind).toBe("not_found");
  });

  it("uses the largest rate-limit reset header for throttled responses", () => {
    const headers = new Headers({
      "X-RateLimit-Reset-ip": "749",
      "X-RateLimit-Reset-email": "812",
    });
    const err = normalizeErrorResponse(429, {}, headers);
    expect(err.kind).toBe("throttled");
    expect(err.retryAfterSeconds).toBe(812);
  });

  it("ignores rate-limit headers on non-throttled errors", () => {
    const headers = new Headers({ "X-RateLimit-Reset-ip": "749" });
    expect(
      normalizeErrorResponse(401, {}, headers).retryAfterSeconds,
    ).toBeNull();
  });

  it("throttled errors without headers have no retry time", () => {
    expect(normalizeErrorResponse(429, {}).retryAfterSeconds).toBeNull();
  });
});

describe("kindFromStatus and networkError", () => {
  it("maps statuses to kinds", () => {
    expect(kindFromStatus(400)).toBe("validation");
    expect(kindFromStatus(409)).toBe("conflict");
    expect(kindFromStatus(503)).toBe("server");
    expect(kindFromStatus(418)).toBe("unknown");
  });

  it("network errors say the outcome is unknown, not that it failed", () => {
    const err = networkError();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("network");
    expect(err.status).toBeNull();
    expect(err.message).toContain("can't confirm");
  });
});

describe("toFieldErrors", () => {
  it("maps the real register validation messages onto fields", () => {
    const messages = [
      "lastName must be shorter than or equal to 100 characters",
      "lastName should not be empty",
      "lastName must be a string",
      "email must be an email",
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      "Password must be at least 8 characters long",
    ];
    const { fields, general } = toFieldErrors(messages, [
      "firstName",
      "lastName",
      "email",
      "password",
    ]);
    expect(fields.lastName).toHaveLength(3);
    expect(fields.email).toHaveLength(1);
    expect(fields.password).toHaveLength(2);
    expect(general).toEqual([]);
  });

  it("returns unmatched messages as general errors", () => {
    const { fields, general } = toFieldErrors(
      ["items.0.quantity must be a number", "email must be an email"],
      ["email"],
    );
    expect(fields.email).toHaveLength(1);
    expect(general).toEqual(["items.0.quantity must be a number"]);
  });
});
