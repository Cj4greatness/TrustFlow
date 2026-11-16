"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/auth/browser";
import { can } from "@/lib/auth/permissions";
import {
  CUSTOMER_STATUSES,
  customerLabel,
  customersPath,
  parseCustomerPage,
  type Customer,
  type CustomerPage,
  type CustomerStatus,
} from "@/lib/customers/customers";
import { cn } from "@/lib/utils";

const FIELD =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATUS_STYLES: Record<CustomerStatus, string> = {
  lead: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function asStatus(value: string): CustomerStatus | undefined {
  return (CUSTOMER_STATUSES as readonly string[]).includes(value)
    ? (value as CustomerStatus)
    : undefined;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

type ListResult =
  | { key: string; status: "ready"; data: CustomerPage }
  | { key: string; status: "error" };

type ListState =
  | { status: "loading" }
  | { status: "ready"; data: CustomerPage }
  | { status: "error" };

// The result is remembered with the exact request it belongs to. Anything that
// does not match the current request (another page, another filter, another
// organization) counts as "loading", so stale rows can never be shown.
function useCustomerList(
  enabled: boolean,
  organizationId: string,
  search: string,
  status: CustomerStatus | undefined,
  page: number,
  attempt: number,
): ListState {
  const path = customersPath(organizationId, { search, status, page });
  const key = `${path}|${attempt}`;
  const [result, setResult] = useState<ListResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getBrowserAuth()
      .api.get<unknown>(path, { signal: controller.signal })
      .then((json) => {
        if (controller.signal.aborted) return;
        const data = parseCustomerPage(json);
        setResult(
          data === null
            ? { key, status: "error" }
            : { key, status: "ready", data },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult({ key, status: "error" });
      });
    return () => controller.abort();
  }, [enabled, key, path]);

  if (result === null || result.key !== key) return { status: "loading" };
  return result.status === "ready"
    ? { status: "ready", data: result.data }
    : { status: "error" };
}

export function StatusBadge({ status }: { status: CustomerStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {capitalize(status)}
    </span>
  );
}

function Contact({ customer }: { customer: Customer }) {
  if (!customer.email && !customer.phone) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col">
      {customer.email ? <span>{customer.email}</span> : null}
      {customer.phone ? (
        <span className="text-muted-foreground">{customer.phone}</span>
      ) : null}
    </div>
  );
}

function typeLabel(customer: Customer): string {
  return customer.customerType === "business" ? "Business" : "Individual";
}

function CustomerTable({ customers }: { customers: readonly Customer[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Customer
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Contact
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Added
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((customer) => (
            <tr key={customer.id}>
              <td className="px-4 py-3">
                <p className="font-medium">
                  <Link
                    href={`/customers/${encodeURIComponent(customer.id)}`}
                    className="hover:underline"
                  >
                    {customerLabel(customer)}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel(customer)}
                </p>
              </td>
              <td className="px-4 py-3">
                <Contact customer={customer} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={customer.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatDate(customer.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerCards({ customers }: { customers: readonly Customer[] }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {customers.map((customer) => (
        <li
          key={customer.id}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">
                <Link
                  href={`/customers/${encodeURIComponent(customer.id)}`}
                  className="hover:underline"
                >
                  {customerLabel(customer)}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {typeLabel(customer)}
              </p>
            </div>
            <StatusBadge status={customer.status} />
          </div>
          <Contact customer={customer} />
          <p className="text-xs text-muted-foreground">
            Added {formatDate(customer.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CustomerResults({
  data,
  filtersActive,
  onClear,
  onPage,
}: {
  data: CustomerPage;
  filtersActive: boolean;
  onClear: () => void;
  onPage: (page: number) => void;
}) {
  if (data.customers.length === 0) {
    if (data.total > 0) {
      return (
        <EmptyState
          title="This page is empty"
          description="The list has changed since you opened it."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPage(1)}
            >
              Go to the first page
            </Button>
          }
        />
      );
    }
    return filtersActive ? (
      <EmptyState
        title="No customers match your search"
        description="Try a different search or clear the filters."
        action={
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="No customers yet"
        description="Customers you add will appear here."
      />
    );
  }

  const first = (data.page - 1) * data.limit + 1;
  const last = first + data.customers.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <CustomerTable customers={data.customers} />
      <CustomerCards customers={data.customers} />
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {first}–{last} of {data.total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => onPage(data.page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {Math.max(data.totalPages, 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.page >= data.totalPages}
            onClick={() => onPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CustomersView() {
  const { state } = useOrg();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const ready = state.status === "ready";
  const organizationId = state.status === "ready" ? state.organization.id : "";
  const allowed = state.status === "ready" && can(state.role, "customer:read");
  const list = useCustomerList(
    allowed,
    organizationId,
    search,
    status,
    page,
    attempt,
  );

  if (!ready) return null;

  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Customers" />
        <EmptyState
          title="You do not have access to customers"
          description="Ask an owner or admin of your organization if you need it."
        />
      </div>
    );
  }

  const filtersActive = search !== "" || status !== undefined;
  const canCreate =
    state.status === "ready" && can(state.role, "customer:create");

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus(undefined);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="People and businesses you sell to."
        action={
          canCreate ? (
            <Button asChild>
              <Link href="/customers/new">Add customer</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="customer-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name or email"
            className={cn(FIELD, "w-full pl-9")}
          />
        </div>
        <div>
          <label htmlFor="customer-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="customer-status"
            value={status ?? ""}
            onChange={(event) => {
              setStatus(asStatus(event.target.value));
              setPage(1);
            }}
            className={cn(FIELD, "w-full sm:w-44")}
          >
            <option value="">All statuses</option>
            {CUSTOMER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {capitalize(option)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.status === "loading" ? <LoadingState rows={5} /> : null}
      {list.status === "error" ? (
        <ErrorState
          title="We could not load customers"
          message="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : null}
      {list.status === "ready" ? (
        <CustomerResults
          data={list.data}
          filtersActive={filtersActive}
          onClear={clearFilters}
          onPage={setPage}
        />
      ) : null}
    </div>
  );
}
