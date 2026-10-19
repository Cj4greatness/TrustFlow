import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import {
  describeAuthError,
  LOGIN_FIELDS,
  REGISTER_FIELDS,
  toLoginPayload,
  toRegisterPayload,
  validateLogin,
  validateRegister,
} from "./auth-forms";

const validRegister = {
  firstName: "Chisom",
  lastName: "Johnson",
  email: "chisom@example.com",
  password: "SecurePass123",
  phone: "",
};

describe("validateLogin", () => {
  it("accepts a valid email and any non-empty password", () => {
    expect(
      validateLogin({ email: " ada@example.com ", password: "x" }),
    ).toEqual({});
  });

  it("asks for both fields when empty", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({
      email: "Enter your email address.",
      password: "Enter your password.",
    });
  });

  it("rejects a malformed email", () => {
    expect(validateLogin({ email: "not-an-email", password: "x" }).email).toBe(
      "Enter a valid email address.",
    );
  });
});

describe("validateRegister", () => {
  it("accepts valid input, with the phone optional", () => {
    expect(validateRegister(validRegister)).toEqual({});
    expect(
      validateRegister({ ...validRegister, phone: "+2348012345678" }),
    ).toEqual({});
  });

  it("requires both names and limits their length", () => {
    const errors = validateRegister({
      ...validRegister,
      firstName: "  ",
      lastName: "x".repeat(101),
    });
    expect(errors.firstName).toMatch(/first name/);
    expect(errors.lastName).toMatch(/too long/);
  });

  it("checks the email", () => {
    expect(validateRegister({ ...validRegister, email: "" }).email).toBe(
      "Enter your email address.",
    );
    expect(
      validateRegister({ ...validRegister, email: "a".repeat(260) + "@b.co" })
        .email,
    ).toBe("Email address is too long.");
  });

  it("enforces the password rules", () => {
    const check = (password: string) =>
      validateRegister({ ...validRegister, password }).password;
    expect(check("")).toBe("Enter a password.");
    expect(check("short1A")).toMatch(/at least 8/);
    expect(check("Aa1" + "x".repeat(126))).toMatch(/128/);
    expect(check("alllowercase1")).toMatch(/uppercase/);
    expect(check("ALLUPPERCASE1")).toMatch(/lowercase/);
    expect(check("NoDigitsHere")).toMatch(/number/);
    expect(check("SecurePass123")).toBeUndefined();
  });

  it("limits the phone length", () => {
    expect(
      validateRegister({ ...validRegister, phone: "1".repeat(31) }).phone,
    ).toBe("Phone number is too long.");
    expect(
      validateRegister({ ...validRegister, phone: "  " }).phone,
    ).toBeUndefined();
  });
});

describe("payloads", () => {
  it("trims the login email but not the password", () => {
    expect(toLoginPayload({ email: " a@b.co ", password: " p " })).toEqual({
      email: "a@b.co",
      password: " p ",
    });
  });

  it("trims register fields and omits an empty phone", () => {
    expect(
      toRegisterPayload({
        ...validRegister,
        firstName: " Chisom ",
        phone: " ",
      }),
    ).toEqual({
      firstName: "Chisom",
      lastName: "Johnson",
      email: "chisom@example.com",
      password: "SecurePass123",
    });
    expect(
      toRegisterPayload({ ...validRegister, phone: " +234 801 " }).phone,
    ).toBe("+234 801");
  });
});

describe("describeAuthError", () => {
  it("maps validation messages onto fields and keeps the rest general", () => {
    const error = new ApiError({
      kind: "validation",
      status: 400,
      messages: [
        "email must be an email",
        "Password must be at least 8 characters long",
        "something odd",
      ],
    });
    const result = describeAuthError(error, "register", REGISTER_FIELDS);
    expect(result.fields.email).toEqual(["email must be an email"]);
    expect(result.fields.password).toEqual([
      "Password must be at least 8 characters long",
    ]);
    expect(result.general).toEqual(["something odd"]);
  });

  it("falls back to the default message when validation has no messages", () => {
    const error = new ApiError({ kind: "validation", status: 400 });
    const result = describeAuthError(error, "login", LOGIN_FIELDS);
    expect(result.fields).toEqual({});
    expect(result.general).toEqual([error.message]);
  });

  it("never reveals which part of a login was wrong", () => {
    const error = new ApiError({
      kind: "unauthorized",
      status: 401,
      messages: ["User not found"],
    });
    expect(describeAuthError(error, "login", LOGIN_FIELDS).general).toEqual([
      "Incorrect email or password.",
    ]);
  });

  it("puts an existing-email conflict on the email field when registering", () => {
    const error = new ApiError({ kind: "conflict", status: 409 });
    const result = describeAuthError(error, "register", REGISTER_FIELDS);
    expect(result.fields.email?.[0]).toMatch(/already exists/);
    expect(result.general).toEqual([]);
  });

  it("turns retry-after into a readable wait", () => {
    const wait = (seconds: number | null) =>
      describeAuthError(
        new ApiError({
          kind: "throttled",
          status: 429,
          retryAfterSeconds: seconds,
        }),
        "login",
        LOGIN_FIELDS,
      ).general[0];
    expect(wait(30)).toMatch(/30 seconds/);
    expect(wait(1)).toMatch(/1 second\./);
    expect(wait(300)).toMatch(/5 minutes/);
    expect(wait(null)).toMatch(/Too many attempts/);
  });

  it("uses the default message for network and server errors", () => {
    const network = new ApiError({ kind: "network", status: null });
    const server = new ApiError({ kind: "server", status: 500 });
    expect(describeAuthError(network, "login", LOGIN_FIELDS).general).toEqual([
      network.message,
    ]);
    expect(describeAuthError(server, "login", LOGIN_FIELDS).general).toEqual([
      server.message,
    ]);
  });

  it("handles errors that are not ApiErrors", () => {
    expect(
      describeAuthError(new Error("boom"), "login", LOGIN_FIELDS).general,
    ).toEqual(["Something unexpected happened. Please try again."]);
  });
});
