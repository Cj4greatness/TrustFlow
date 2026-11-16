import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import { customerToFormValues, toUpdatePayload } from "./customer-edit";
import { describeCustomerError } from "./customer-form";
import type { Customer } from "./customers";

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "c1",
  customerType: "individual",
  status: "active",
  displayName: "AmiBell",
  firstName: "Amina",
  lastName: "Bello",
  companyName: null,
  email: "amina.bello@example.com",
  phone: null,
  source: null,
  createdAt: "2026-11-15T10:00:00.000Z",
  ...overrides,
});

describe("customerToFormValues", () => {
  it("turns empty fields into empty strings", () => {
    const values = customerToFormValues(customer());
    expect(values.phone).toBe("");
    expect(values.companyName).toBe("");
    expect(values.firstName).toBe("Amina");
    expect(values.customerType).toBe("individual");
  });
});

describe("toUpdatePayload", () => {
  it("sends nothing when nothing changed", () => {
    const original = customer();
    expect(toUpdatePayload(customerToFormValues(original), original)).toEqual(
      {},
    );
  });

  it("sends only the fields that changed, trimmed", () => {
    const original = customer();
    const values = { ...customerToFormValues(original), phone: " 0801 " };
    expect(toUpdatePayload(values, original)).toEqual({ phone: "0801" });
  });

  it("sends null to clear a field", () => {
    const original = customer();
    const values = { ...customerToFormValues(original), email: "" };
    expect(toUpdatePayload(values, original)).toEqual({ email: null });
  });

  it("sends a changed status", () => {
    const original = customer();
    const values = {
      ...customerToFormValues(original),
      status: "archived" as const,
    };
    expect(toUpdatePayload(values, original)).toEqual({ status: "archived" });
  });

  it("keeps the display name as shown when a name changes", () => {
    const original = customer();
    const values = { ...customerToFormValues(original), lastName: "Bello-Ade" };
    expect(toUpdatePayload(values, original)).toEqual({
      lastName: "Bello-Ade",
      displayName: "AmiBell",
    });
  });

  it("sends a changed display name on its own", () => {
    const original = customer();
    const values = {
      ...customerToFormValues(original),
      displayName: "Amina B.",
    };
    expect(toUpdatePayload(values, original)).toEqual({
      displayName: "Amina B.",
    });
  });

  it("rebuilds the display name when it is cleared", () => {
    const original = customer();
    const values = { ...customerToFormValues(original), displayName: "" };
    const payload = toUpdatePayload(values, original);
    expect(payload).toEqual({
      firstName: "Amina",
      lastName: "Bello",
      companyName: null,
    });
    expect(payload).not.toHaveProperty("displayName");
  });

  it("never sends the customer type", () => {
    const original = customer({
      customerType: "business",
      companyName: "Acme",
    });
    const values = { ...customerToFormValues(original), phone: "1" };
    expect(toUpdatePayload(values, original)).not.toHaveProperty(
      "customerType",
    );
  });
});

describe("describeCustomerError for a duplicate email", () => {
  it("shows it next to the email field", () => {
    const failure = describeCustomerError(
      new ApiError({
        kind: "conflict",
        status: 409,
        messages: [
          "A customer with this email already exists in this organization",
        ],
      }),
    );
    expect(failure.fields.email).toContain("already exists");
    expect(failure.general).toEqual([]);
  });

  it("keeps other conflicts as general messages", () => {
    const failure = describeCustomerError(
      new ApiError({
        kind: "conflict",
        status: 409,
        messages: ["Record is locked"],
      }),
    );
    expect(failure.general).toEqual(["Record is locked"]);
    expect(failure.fields).toEqual({});
  });
});
