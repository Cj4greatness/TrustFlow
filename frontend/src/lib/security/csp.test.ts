import { describe, expect, it } from "vitest";
import { apiOriginFrom, buildCsp, generateNonce } from "./csp";

const directive = (policy: string, name: string): string[] => {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.split(/\s+/).slice(1) : [];
};

const production = {
  nonce: "abc123",
  apiOrigin: "http://localhost:4000",
  isDevelopment: false,
};

describe("generateNonce", () => {
  it("is 16 random bytes in base64", () => {
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("is different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50);
  });
});

describe("apiOriginFrom", () => {
  it("keeps only the origin of an http(s) URL", () => {
    expect(apiOriginFrom("http://localhost:4000/some/path?x=1")).toBe(
      "http://localhost:4000",
    );
    expect(apiOriginFrom("https://api.example.com")).toBe(
      "https://api.example.com",
    );
  });

  it("returns null for missing, invalid, or non-http values", () => {
    expect(apiOriginFrom(undefined)).toBeNull();
    expect(apiOriginFrom("")).toBeNull();
    expect(apiOriginFrom("not a url")).toBeNull();
    expect(apiOriginFrom("ftp://files.example.com")).toBeNull();
  });
});

describe("buildCsp", () => {
  it("requires the nonce for scripts and styles in production", () => {
    const policy = buildCsp(production);
    expect(directive(policy, "script-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
    expect(directive(policy, "style-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
    ]);
  });

  it("never allows unsafe-inline or unsafe-eval for scripts in production", () => {
    const scripts = directive(buildCsp(production), "script-src");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("relaxes only eval and inline styles in development", () => {
    const policy = buildCsp({ ...production, isDevelopment: true });
    expect(directive(policy, "script-src")).toContain("'unsafe-eval'");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(policy, "style-src")).toContain("'unsafe-inline'");
  });

  it("locks down plugins, base URI, forms, and framing", () => {
    const policy = buildCsp(production);
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows connections to self and the API origin only, with no wildcard", () => {
    expect(directive(buildCsp(production), "connect-src")).toEqual([
      "'self'",
      "http://localhost:4000",
    ]);
    expect(
      directive(buildCsp({ ...production, apiOrigin: null }), "connect-src"),
    ).toEqual(["'self'"]);
    expect(buildCsp(production)).not.toContain("*");
  });
});
