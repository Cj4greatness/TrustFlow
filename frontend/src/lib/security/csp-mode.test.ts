import { describe, expect, it } from "vitest";
import { cspHeaderName, parseCspMode } from "./csp";

describe("parseCspMode", () => {
  it("defaults to report-only when unset or empty", () => {
    expect(parseCspMode(undefined)).toBe("report-only");
    expect(parseCspMode(null)).toBe("report-only");
    expect(parseCspMode("")).toBe("report-only");
    expect(parseCspMode("   ")).toBe("report-only");
  });

  it("accepts the two known values, ignoring case and spaces", () => {
    expect(parseCspMode("report-only")).toBe("report-only");
    expect(parseCspMode(" Report-Only ")).toBe("report-only");
    expect(parseCspMode("enforce")).toBe("enforce");
    expect(parseCspMode(" ENFORCE ")).toBe("enforce");
  });

  it("treats any other value as enforce, so a typo cannot weaken the policy", () => {
    expect(parseCspMode("enfroce")).toBe("enforce");
    expect(parseCspMode("off")).toBe("enforce");
    expect(parseCspMode("report_only")).toBe("enforce");
  });
});

describe("cspHeaderName", () => {
  it("uses the blocking header in enforce mode", () => {
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });

  it("uses the reporting header in report-only mode", () => {
    expect(cspHeaderName("report-only")).toBe(
      "Content-Security-Policy-Report-Only",
    );
  });
});
