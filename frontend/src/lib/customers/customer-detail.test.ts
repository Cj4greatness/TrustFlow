import { describe, expect, it } from "vitest";
import { customerPath, parseCustomer } from "./customers";

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  organizationId: "o1",
  customerType: "business",
  displayName: null,
  firstName: "Tunde",
  lastName: null,
  companyName: "Acme Ltd",
  email: "tunde@example.com",
  phone: "0801",
  status: "lead",
  source: "Referral",
  createdAt: "2026-11-01T10:00:00.000Z",
  creator: { passwordHash: "secret-hash", refreshTokenHash: "other-secret" },
  ...overrides,
});

describe("customerPath", () => {
  it("builds the URL of one customer and encodes both ids", () => {
    expect(customerPath("org 1", "c/1")).toBe(
      "/organizations/org%201/customers/c%2F1",
    );
  });
});

describe("parseCustomer", () => {
  it("reads one customer", () => {
    expect(parseCustomer(record())).toMatchObject({
      id: "c1",
      customerType: "business",
      status: "lead",
      companyName: "Acme Ltd",
      source: "Referral",
    });
  });

  it("keeps only the fields the UI needs", () => {
    const json = JSON.stringify(parseCustomer(record()));
    expect(json).not.toContain("secret-hash");
    expect(json).not.toContain("other-secret");
    expect(json).not.toContain("creator");
  });

  it("rejects a record without a valid id, type or status", () => {
    expect(parseCustomer(null)).toBeNull();
    expect(parseCustomer({})).toBeNull();
    expect(parseCustomer(record({ id: "" }))).toBeNull();
    expect(parseCustomer(record({ customerType: "x" }))).toBeNull();
    expect(parseCustomer(record({ status: "vip" }))).toBeNull();
  });
});
