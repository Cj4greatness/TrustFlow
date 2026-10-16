import { describe, expect, it } from "vitest";
import {
  clearedRefreshCookieOptions,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  refreshCookieOptions,
} from "./cookies";

describe("refresh cookie policy", () => {
  it("is HttpOnly, SameSite=Strict, and scoped to the BFF auth path", () => {
    const options = refreshCookieOptions(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("strict");
    expect(options.path).toBe(REFRESH_COOKIE_PATH);
    expect(options.path).toBe("/api/auth");
    expect(options.maxAge).toBe(REFRESH_COOKIE_MAX_AGE_SECONDS);
  });

  it("is Secure in production and only relaxed outside it", () => {
    expect(refreshCookieOptions(true).secure).toBe(true);
    expect(refreshCookieOptions(false).secure).toBe(false);
  });

  it("clears with the same attributes and a zero max age", () => {
    const cleared = clearedRefreshCookieOptions(true);
    expect(cleared.maxAge).toBe(0);
    expect(cleared.path).toBe(refreshCookieOptions(true).path);
    expect(cleared.httpOnly).toBe(true);
    expect(cleared.secure).toBe(true);
  });

  it("uses a stable cookie name", () => {
    expect(REFRESH_COOKIE_NAME).toBe("tf_refresh");
  });
});
