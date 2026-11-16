import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import {
  describeCustomerError,
  EMPTY_CUSTOMER_FORM,
  toCreatePayload,
  validateCustomerForm,
  type CustomerFormValues,
} from "./customer-form";

const form = (
  overrides: Partial<CustomerFormValues> = {},
): CustomerFormValues => ({
  ...EMPTY_CUSTOMER_FORM,
  ...overrides,
});

describe("validateCustomerForm", () => {
  it("asks an individual for at least one name", () => {
    expect(validateCustomerForm(form()).firstName).toBeDefined();
    expect(validateCustomerForm(form({ firstName: "Amina" }))).toEqual({});
    expect(validateCustomerForm(form({ lastName: "Bello" }))).toEqual({});
    expect(validateCustomerForm(form({ displayName: "Amina B." }))).toEqual({});
    expect(
      validateCustomerForm(form({ firstName: "   " })).firstName,
    ).toBeDefined();
  });

  it("asks a business for the company name", () => {
    const business = form({ customerType: "business", firstName: "Tunde" });
    expect(validateCustomerForm(business).companyName).toBeDefined();
    expect(
      validateCustomerForm({ ...business, companyName: "Acme Ltd" }),
    ).toEqual({});
  });

  it("checks the email only when one is given", () => {
    expect(validateCustomerForm(form({ firstName: "A", email: "" }))).toEqual(
      {},
    );
    expect(
      validateCustomerForm(form({ firstName: "A", email: "nope" })).email,
    ).toBeDefined();
    expect(
      validateCustomerForm(form({ firstName: "A", email: "a@b.co" })),
    ).toEqual({});
    expect(
      validateCustomerForm(
        form({ firstName: "A", email: `${"a".repeat(260)}@b.co` }),
      ).email,
    ).toBeDefined();
  });
});

describe("toCreatePayload", () => {
  it("sends the type and status, and leaves blank fields out", () => {
    expect(toCreatePayload(form({ firstName: " Amina " }))).toEqual({
      customerType: "individual",
      status: "active",
      firstName: "Amina",
    });
  });

  it("keeps the company name for a business", () => {
    expect(
      toCreatePayload(
        form({
          customerType: "business",
          companyName: " Acme Ltd ",
          phone: "0801",
        }),
      ),
    ).toEqual({
      customerType: "business",
      status: "active",
      companyName: "Acme Ltd",
      phone: "0801",
    });
  });

  it("drops a company name left over from switching back to individual", () => {
    const payload = toCreatePayload(
      form({ firstName: "Amina", companyName: "Old Co" }),
    );
    expect(payload).not.toHaveProperty("companyName");
  });
});

describe("describeCustomerError", () => {
  it("puts validation messages next to their fields", () => {
    const failure = describeCustomerError(
      new ApiError({
        kind: "validation",
        status: 400,
        messages: [
          "email must be an email",
          "customerType must be one of individual, business",
        ],
      }),
    );
    expect(failure.fields.email).toBe("email must be an email");
    expect(failure.fields.customerType).toContain("customerType");
    expect(failure.general).toEqual([]);
  });

  it("keeps messages it cannot place as general errors", () => {
    const failure = describeCustomerError(
      new ApiError({
        kind: "validation",
        status: 400,
        messages: ["Something odd"],
      }),
    );
    expect(failure.fields).toEqual({});
    expect(failure.general).toEqual(["Something odd"]);
  });

  it("explains a missing permission", () => {
    const failure = describeCustomerError(
      new ApiError({ kind: "forbidden", status: 403 }),
    );
    expect(failure.general[0]).toContain("permission");
  });

  it("tells the person to check the list after a network failure", () => {
    const failure = describeCustomerError(
      new ApiError({ kind: "network", status: null }),
    );
    expect(failure.general[0]).toContain("Check the customers list");
  });

  it("uses the server message for other API errors", () => {
    const failure = describeCustomerError(
      new ApiError({
        kind: "conflict",
        status: 409,
        messages: ["Record already exists"],
      }),
    );
    expect(failure.general).toEqual(["Record already exists"]);
  });

  it("handles anything that is not an API error", () => {
    expect(describeCustomerError(new Error("boom")).general).toEqual([
      "Something unexpected happened. Please try again.",
    ]);
  });
});
