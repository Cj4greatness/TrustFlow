import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatKobo,
  koboToApiNumber,
  MoneyError,
  parseDecimalToKobo,
  parseKobo,
} from "./money";

describe("formatKobo", () => {
  it("formats kobo with two decimals", () => {
    expect(formatKobo(450000)).toBe("₦4,500.00");
    expect(formatKobo(5)).toBe("₦0.05");
    expect(formatKobo(0)).toBe("₦0.00");
    expect(formatKobo(123456789)).toBe("₦1,234,567.89");
  });

  it("accepts bigint and integer strings", () => {
    expect(formatKobo(BigInt(450000))).toBe("₦4,500.00");
    expect(formatKobo("450000")).toBe("₦4,500.00");
  });

  it("handles amounts beyond the safe integer range via bigint", () => {
    expect(formatKobo(BigInt("900719925474099199"))).toBe(
      "₦9,007,199,254,740,991.99",
    );
  });

  it("formats negative amounts", () => {
    expect(formatKobo(-150)).toBe("-₦1.50");
  });

  it("rejects floats, unsafe numbers, and malformed strings", () => {
    expect(() => formatKobo(10.5)).toThrow(MoneyError);
    expect(() => formatKobo(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
    expect(() => formatKobo(Number.NaN)).toThrow(MoneyError);
    expect(() => formatKobo("12.5")).toThrow(MoneyError);
    expect(() => formatKobo("")).toThrow(MoneyError);
  });

  it("uses the organisation currency when given", () => {
    expect(formatKobo(100, "USD")).toContain("1.00");
  });
});

describe("parseDecimalToKobo", () => {
  it("converts decimal strings without float error", () => {
    expect(parseDecimalToKobo("4500.00")).toBe(BigInt(450000));
    expect(parseDecimalToKobo("19.99")).toBe(BigInt(1999));
    expect(parseDecimalToKobo("0.1")).toBe(BigInt(10));
    expect(parseDecimalToKobo("4500")).toBe(BigInt(450000));
    expect(parseDecimalToKobo("-0.05")).toBe(BigInt(-5));
  });

  it("rejects more than two decimals and non-decimal input", () => {
    expect(() => parseDecimalToKobo("1.234")).toThrow(MoneyError);
    expect(() => parseDecimalToKobo("abc")).toThrow(MoneyError);
    expect(() => parseDecimalToKobo("")).toThrow(MoneyError);
    expect(() => parseDecimalToKobo("1e3")).toThrow(MoneyError);
    expect(() => parseDecimalToKobo("1,000")).toThrow(MoneyError);
  });
});

describe("formatDecimal", () => {
  it("formats product-style decimal strings", () => {
    expect(formatDecimal("4500.00")).toBe("₦4,500.00");
    expect(formatDecimal("1234.5")).toBe("₦1,234.50");
    expect(formatDecimal("0.1")).toBe("₦0.10");
  });
});

describe("parseKobo and koboToApiNumber", () => {
  it("round-trips safe amounts", () => {
    expect(koboToApiNumber(parseKobo(450000))).toBe(450000);
  });

  it("refuses to send amounts that cannot be a JSON number", () => {
    expect(() => koboToApiNumber(BigInt("900719925474099199"))).toThrow(
      MoneyError,
    );
  });
});
