import { describe, expect, it } from "vitest";
import {
  customerLabel,
  customersPath,
  parseCustomerPage,
  type Customer,
} from "./customers";

const record = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  organizationId: "o1",
  customerType: "individual",
  displayName: "Amina Bello",
  firstName: "Amina",
  lastName: "Bello",
  companyName: null,
  email: "amina@example.com",
  phone: null,
  status: "active",
  source: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  creator: { passwordHash: "secret-hash", email: "owner@example.com" },
  ...overrides,
});

const envelope = (data: unknown[], extra: Record<string, unknown> = {}) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...extra,
});

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "c1",
  customerType: "individual",
  status: "active",
  displayName: null,
  firstName: null,
  lastName: null,
  companyName: null,
  email: null,
  phone: null,
  source: null,
  createdAt: null,
  ...overrides,
});

describe("customersPath", () => {
  it("builds the default list URL and encodes the organization id", () => {
    expect(customersPath("org 1")).toBe(
      "/organizations/org%201/customers?page=1&limit=20",
    );
  });

  it("adds a trimmed search and a status, and leaves blanks out", () => {
    expect(
      customersPath("o1", { search: " amina ", status: "active", page: 2 }),
    ).toBe(
      "/organizations/o1/customers?search=amina&status=active&page=2&limit=20",
    );
    expect(customersPath("o1", { search: "   " })).toBe(
      "/organizations/o1/customers?page=1&limit=20",
    );
  });

  it("never asks for a page below 1 or a broken number", () => {
    expect(customersPath("o1", { page: 0 })).toContain("page=1");
    expect(customersPath("o1", { page: Number.NaN })).toContain("page=1");
    expect(customersPath("o1", { page: 2.7 })).toContain("page=2");
  });
});

describe("parseCustomerPage", () => {
  it("reads a valid page", () => {
    const parsed = parseCustomerPage(
      envelope([record()], { total: 41, totalPages: 3 }),
    );
    expect(parsed?.total).toBe(41);
    expect(parsed?.totalPages).toBe(3);
    expect(parsed?.customers[0]).toMatchObject({
      id: "c1",
      customerType: "individual",
      status: "active",
      displayName: "Amina Bello",
      phone: null,
    });
  });

  it("accepts an empty list", () => {
    expect(parseCustomerPage(envelope([]))?.customers).toEqual([]);
  });

  it("keeps only the fields the UI needs", () => {
    const parsed = parseCustomerPage(envelope([record()]));
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("secret-hash");
    expect(json).not.toContain("creator");
    expect(json).not.toContain("organizationId");
  });

  it("rejects a response that is not the expected envelope", () => {
    for (const bad of [null, [], "x", {}, { data: "no" }]) {
      expect(parseCustomerPage(bad)).toBeNull();
    }
    expect(parseCustomerPage(envelope([], { total: "5" }))).toBeNull();
    expect(parseCustomerPage(envelope([], { page: -1 }))).toBeNull();
  });

  it("rejects the whole page when a record is malformed", () => {
    expect(parseCustomerPage(envelope([record(), { id: "c2" }]))).toBeNull();
    expect(parseCustomerPage(envelope([record({ status: "vip" })]))).toBeNull();
    expect(
      parseCustomerPage(envelope([record({ customerType: "x" })])),
    ).toBeNull();
    expect(parseCustomerPage(envelope([record({ id: "" })]))).toBeNull();
  });
});

describe("customerLabel", () => {
  it("prefers the display name", () => {
    expect(
      customerLabel(customer({ displayName: "Amina B.", firstName: "Amina" })),
    ).toBe("Amina B.");
  });

  it("uses the company for a business without a display name", () => {
    expect(
      customerLabel(
        customer({
          customerType: "business",
          companyName: "Acme Ltd",
          firstName: "Tunde",
        }),
      ),
    ).toBe("Acme Ltd");
  });

  it("joins first and last name for a person", () => {
    expect(
      customerLabel(customer({ firstName: "Sarah", lastName: "Adeyemi" })),
    ).toBe("Sarah Adeyemi");
    expect(customerLabel(customer({ firstName: "Sarah" }))).toBe("Sarah");
  });

  it("falls back to email, then to a plain placeholder", () => {
    expect(customerLabel(customer({ email: "x@example.com" }))).toBe(
      "x@example.com",
    );
    expect(customerLabel(customer())).toBe("Unnamed customer");
  });
});
