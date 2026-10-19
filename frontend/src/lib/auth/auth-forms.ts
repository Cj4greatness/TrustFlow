// Pure helpers for the login and register forms: client-side checks that
// mirror the backend DTO rules (backend/src/auth/dto), and the mapping of API
// failures onto field and general messages. The backend stays the authority:
// these checks only give fast feedback and never replace its validation.

import { isApiError, toFieldErrors } from "../../api/errors";
import type { Credentials, RegisterInput } from "./browser-auth";

export const LOGIN_FIELDS = ["email", "password"] as const;
export const REGISTER_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "password",
  "phone",
] as const;

export type LoginField = (typeof LOGIN_FIELDS)[number];
export type RegisterField = (typeof REGISTER_FIELDS)[number];
export type LoginValues = Record<LoginField, string>;
export type RegisterValues = Record<RegisterField, string>;
export type FormErrors<F extends string> = Partial<Record<F, string>>;

/** What the UI shows after a failed submit. */
export type FormFailure = {
  fields: Record<string, string[]>;
  general: string[];
};

export type AuthFormContext = "login" | "register";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_LABELS = { firstName: "first name", lastName: "last name" } as const;

function checkEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (email.length > 255) return "Email address is too long.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return undefined;
}

function checkName(
  value: string,
  field: keyof typeof NAME_LABELS,
): string | undefined {
  const name = value.trim();
  if (!name) return `Enter your ${NAME_LABELS[field]}.`;
  if (name.length > 100)
    return "That name is too long (100 characters at most).";
  return undefined;
}

function checkNewPassword(value: string): string | undefined {
  if (!value) return "Enter a password.";
  if (value.length < 8) return "Password must be at least 8 characters long.";
  if (value.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Password must contain an uppercase letter, a lowercase letter and a number.";
  }
  return undefined;
}

export function validateLogin(values: LoginValues): FormErrors<LoginField> {
  const errors: FormErrors<LoginField> = {};
  const email = checkEmail(values.email);
  if (email) errors.email = email;
  // Login accepts any existing password, so only require that one is entered.
  if (!values.password) errors.password = "Enter your password.";
  return errors;
}

export function validateRegister(
  values: RegisterValues,
): FormErrors<RegisterField> {
  const errors: FormErrors<RegisterField> = {};
  const firstName = checkName(values.firstName, "firstName");
  if (firstName) errors.firstName = firstName;
  const lastName = checkName(values.lastName, "lastName");
  if (lastName) errors.lastName = lastName;
  const email = checkEmail(values.email);
  if (email) errors.email = email;
  const password = checkNewPassword(values.password);
  if (password) errors.password = password;
  if (values.phone.trim().length > 30)
    errors.phone = "Phone number is too long.";
  return errors;
}

/** Passwords are sent exactly as typed; only the email is trimmed. */
export function toLoginPayload(values: LoginValues): Credentials {
  return { email: values.email.trim(), password: values.password };
}

export function toRegisterPayload(values: RegisterValues): RegisterInput {
  const payload: RegisterInput = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    password: values.password,
  };
  const phone = values.phone.trim();
  if (phone) payload.phone = phone;
  return payload;
}

function formatWait(seconds: number): string {
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} minutes`;
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

export function describeAuthError(
  error: unknown,
  context: AuthFormContext,
  fields: readonly string[],
): FormFailure {
  const general = (...messages: string[]): FormFailure => ({
    fields: {},
    general: messages,
  });

  if (!isApiError(error)) {
    return general("Something unexpected happened. Please try again.");
  }

  switch (error.kind) {
    case "validation": {
      const mapped = toFieldErrors(error.messages, fields);
      const hasAny =
        Object.keys(mapped.fields).length > 0 || mapped.general.length > 0;
      return hasAny ? mapped : general(error.message);
    }
    case "unauthorized":
      // Never reveal whether the email exists or the password was wrong.
      return context === "login"
        ? general("Incorrect email or password.")
        : general(error.message);
    case "conflict":
      if (context === "register" && fields.includes("email")) {
        return {
          fields: {
            email: [
              "An account with this email already exists. Try signing in instead.",
            ],
          },
          general: [],
        };
      }
      return general(error.message);
    case "throttled": {
      const wait = error.retryAfterSeconds;
      if (wait !== null && wait > 0) {
        return general(
          `Too many attempts. Please try again in ${formatWait(wait)}.`,
        );
      }
      return general(error.message);
    }
    default:
      return general(error.message);
  }
}
