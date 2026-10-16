import { describe, expect, it } from "vitest";
import { checkCsrf, CSRF_HEADER } from "./csrf";

const headers = (extra: Record<string, string>) =>
  new Headers({ [CSRF_HEADER]: "1", host: "app.example.com", ...extra });

describe("checkCsrf", () => {
  it("accepts same-origin requests that carry the CSRF header", () => {
    expect(checkCsrf(headers({ "sec-fetch-site": "same-origin" }))).toEqual({
      ok: true,
    });
  });

  it("rejects cross-site and same-site requests", () => {
    expect(checkCsrf(headers({ "sec-fetch-site": "cross-site" })).ok).toBe(
      false,
    );
    expect(checkCsrf(headers({ "sec-fetch-site": "same-site" })).ok).toBe(
      false,
    );
  });

  it("rejects a missing or wrong CSRF header even when same-origin", () => {
    const missing = new Headers({
      host: "app.example.com",
      "sec-fetch-site": "same-origin",
    });
    expect(checkCsrf(missing).ok).toBe(false);
    expect(
      checkCsrf(
        headers({ [CSRF_HEADER]: "0", "sec-fetch-site": "same-origin" }),
      ).ok,
    ).toBe(false);
  });

  it("falls back to comparing Origin with the host", () => {
    expect(checkCsrf(headers({ origin: "https://app.example.com" })).ok).toBe(
      true,
    );
    expect(checkCsrf(headers({ origin: "https://evil.example.net" })).ok).toBe(
      false,
    );
  });

  it("prefers x-forwarded-host behind a proxy", () => {
    const proxied = headers({
      host: "internal-service:8080",
      "x-forwarded-host": "app.example.com",
      origin: "https://app.example.com",
    });
    expect(checkCsrf(proxied).ok).toBe(true);
  });

  it("refuses when the origin cannot be verified at all", () => {
    const result = checkCsrf(headers({}));
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed Origin", () => {
    expect(checkCsrf(headers({ origin: "not a url" })).ok).toBe(false);
  });
});
