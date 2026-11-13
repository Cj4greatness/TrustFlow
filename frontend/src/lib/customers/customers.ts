// Customers: types, list query and response parsing. Pure, so it can be
// tested without a network. Responses arrive as unknown JSON; only the fields
// the UI needs are copied out, so nothing else (for example the creator's
// record) can reach component state.

export const CUSTOMER_TYPES = ["individual", "business"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_STATUSES = [
  "lead",
  "active",
  "inactive",
  "archived",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export type Customer = {
  id: string;
  customerType: CustomerType;
  status: CustomerStatus;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string | null;
};

export type CustomerPage = {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CustomerListQuery = {
  search?: string;
  status?: CustomerStatus;
  page?: number;
  limit?: number;
};

export const DEFAULT_PAGE_SIZE = 20;

function wholeNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : fallback;
}

/** The list URL for one organization. Blank filters are left out. */
export function customersPath(
  organizationId: string,
  query: CustomerListQuery = {},
): string {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.status) params.set("status", query.status);
  params.set("page", String(wholeNumber(query.page, 1)));
  params.set("limit", String(wholeNumber(query.limit, DEFAULT_PAGE_SIZE)));
  return `/organizations/${encodeURIComponent(organizationId)}/customers?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function oneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function parseCustomer(value: unknown): Customer | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const customerType = oneOf(CUSTOMER_TYPES, value.customerType);
  const status = oneOf(CUSTOMER_STATUSES, value.status);
  if (id === null || customerType === null || status === null) return null;
  return {
    id,
    customerType,
    status,
    displayName: text(value.displayName),
    firstName: text(value.firstName),
    lastName: text(value.lastName),
    companyName: text(value.companyName),
    email: text(value.email),
    phone: text(value.phone),
    source: text(value.source),
    createdAt: text(value.createdAt),
  };
}

/**
 * Reads a list response. Returns null when the envelope or any record is not
 * what we expect, so the page shows an error instead of silently dropping data.
 */
export function parseCustomerPage(value: unknown): CustomerPage | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  const total = count(value.total);
  const page = count(value.page);
  const limit = count(value.limit);
  const totalPages = count(value.totalPages);
  if (
    total === null ||
    page === null ||
    limit === null ||
    totalPages === null
  ) {
    return null;
  }
  const customers: Customer[] = [];
  for (const item of value.data) {
    const customer = parseCustomer(item);
    if (customer === null) return null;
    customers.push(customer);
  }
  return { customers, total, page, limit, totalPages };
}

/** The name to show for a customer, whatever fields were filled in. */
export function customerLabel(customer: Customer): string {
  if (customer.displayName) return customer.displayName;
  if (customer.customerType === "business" && customer.companyName) {
    return customer.companyName;
  }
  const person = [customer.firstName, customer.lastName]
    .filter(Boolean)
    .join(" ");
  return person || customer.companyName || customer.email || "Unnamed customer";
}
