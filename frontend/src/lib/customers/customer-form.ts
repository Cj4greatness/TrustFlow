// The "add customer" form: client-side checks, the request body, and the
// mapping of API failures onto fields. Pure, so it can be tested without a
// browser. The backend stays the authority; these checks only give fast
// feedback.

import { isApiError, toFieldErrors } from "../../api/errors";
import type { FormErrors } from "../auth/auth-forms";
import type { CustomerStatus, CustomerType } from "./customers";

export const CUSTOMER_FORM_FIELDS = [
  "customerType",
  "companyName",
  "firstName",
  "lastName",
  "displayName",
  "email",
  "phone",
  "source",
  "status",
] as const;
export type CustomerField = (typeof CUSTOMER_FORM_FIELDS)[number];

export type CustomerFormValues = {
  customerType: CustomerType;
  status: CustomerStatus;
  companyName: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  source: string;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  customerType: "individual",
  status: "active",
  companyName: "",
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  phone: "",
  source: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomerForm(
  values: CustomerFormValues,
): FormErrors<CustomerField> {
  const errors: FormErrors<CustomerField> = {};
  if (values.customerType === "business") {
    if (!values.companyName.trim()) {
      errors.companyName = "Enter the company name.";
    }
  } else if (
    !values.firstName.trim() &&
    !values.lastName.trim() &&
    !values.displayName.trim()
  ) {
    errors.firstName = "Enter a first name, last name or display name.";
  }
  const email = values.email.trim();
  if (email.length > 255) {
    errors.email = "Email address is too long.";
  } else if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

export type CreateCustomerPayload = {
  customerType: CustomerType;
  status: CustomerStatus;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  source?: string;
};

const OPTIONAL_TEXT_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "email",
  "phone",
  "source",
] as const;

/** The request body: trimmed, with blank fields left out entirely. */
export function toCreatePayload(
  values: CustomerFormValues,
): CreateCustomerPayload {
  const payload: CreateCustomerPayload = {
    customerType: values.customerType,
    status: values.status,
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = values[field].trim();
    if (value) payload[field] = value;
  }
  // A company name typed before switching back to "individual" is dropped.
  if (values.customerType === "business") {
    const company = values.companyName.trim();
    if (company) payload.companyName = company;
  }
  return payload;
}

export type CustomerFormFailure = {
  fields: FormErrors<CustomerField>;
  general: string[];
};

/** What to show after a failed submit. */
export function describeCustomerError(error: unknown): CustomerFormFailure {
  const failure: CustomerFormFailure = { fields: {}, general: [] };
  if (!isApiError(error)) {
    failure.general.push("Something unexpected happened. Please try again.");
    return failure;
  }
  if (error.kind === "validation") {
    const mapped = toFieldErrors(error.messages, CUSTOMER_FORM_FIELDS);
    for (const field of CUSTOMER_FORM_FIELDS) {
      const messages = mapped.fields[field];
      if (messages?.length) failure.fields[field] = messages.join(" ");
    }
    failure.general.push(...mapped.general);
    if (
      Object.keys(failure.fields).length === 0 &&
      failure.general.length === 0
    ) {
      failure.general.push(error.message);
    }
    return failure;
  }
  if (error.kind === "forbidden") {
    failure.general.push("You do not have permission to add customers.");
    return failure;
  }
  if (error.kind === "conflict") {
    if (/email/i.test(error.message)) failure.fields.email = error.message;
    else failure.general.push(error.message);
    return failure;
  }
  if (error.kind === "conflict") {
    if (/email/i.test(error.message)) failure.fields.email = error.message;
    else failure.general.push(error.message);
    return failure;
  }
  if (error.kind === "conflict") {
    if (/email/i.test(error.message)) failure.fields.email = error.message;
    else failure.general.push(error.message);
    return failure;
  }
  if (error.kind === "network") {
    failure.general.push(
      `${error.message} Check the customers list before trying again.`,
    );
    return failure;
  }
  failure.general.push(error.message);
  return failure;
}
