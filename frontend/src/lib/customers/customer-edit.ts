// The "edit customer" form: starting values from a customer, and the PATCH
// body. Pure, so it can be tested without a browser.
//
// Backend rules this follows (customers.service, develop):
//   - null clears a nullable field; an empty string would not.
//   - displayName cannot be null. When it is left out and a name field is
//     sent, the backend rebuilds it from the names.
//   - customerType is never sent: the backend does not keep it consistent
//     with the name fields.

import type { CustomerFormValues } from "./customer-form";
import type { Customer, CustomerStatus } from "./customers";

export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    customerType: customer.customerType,
    status: customer.status,
    companyName: customer.companyName ?? "",
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    displayName: customer.displayName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    source: customer.source ?? "",
  };
}

export type UpdateCustomerPayload = {
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: CustomerStatus;
};

const CLEARABLE = [
  "firstName",
  "lastName",
  "companyName",
  "email",
  "phone",
  "source",
] as const;
const NAME_FIELDS = ["firstName", "lastName", "companyName"] as const;

function same(current: string, original: string | null): boolean {
  return current.trim() === (original ?? "");
}

/** Only what changed. An empty object means there is nothing to save. */
export function toUpdatePayload(
  values: CustomerFormValues,
  original: Customer,
): UpdateCustomerPayload {
  const payload: UpdateCustomerPayload = {};
  for (const field of CLEARABLE) {
    if (!same(values[field], original[field])) {
      payload[field] = values[field].trim() || null;
    }
  }
  if (values.status !== original.status) payload.status = values.status;

  const namesChanged = NAME_FIELDS.some(
    (field) => !same(values[field], original[field]),
  );
  const displayName = values.displayName.trim();
  if (displayName) {
    // What the person sees in the box is what gets saved, even when a name
    // changes (otherwise the backend would rebuild it).
    if (namesChanged || displayName !== (original.displayName ?? "")) {
      payload.displayName = displayName;
    }
  } else if (original.displayName) {
    // Cleared: leave it out and send the names so the backend rebuilds it.
    for (const field of NAME_FIELDS) {
      payload[field] = values[field].trim() || null;
    }
  }
  return payload;
}
