"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isApiError } from "@/api/errors";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import {
  capitalize,
  formatDate,
  StatusBadge,
} from "@/components/customers/customers-view";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/auth/browser";
import { can } from "@/lib/auth/permissions";
import {
  customerLabel,
  customerPath,
  parseCustomer,
  type Customer,
} from "@/lib/customers/customers";

type DetailResult =
  | { key: string; status: "ready"; customer: Customer }
  | { key: string; status: "not_found" }
  | { key: string; status: "error" };

type DetailState =
  | { status: "loading" }
  | { status: "ready"; customer: Customer }
  | { status: "not_found" }
  | { status: "error" };

// As in the list: the result is remembered with the exact request it belongs
// to, which includes the organization id, so a record from another
// organization can never be shown after a switch.
function useCustomer(
  enabled: boolean,
  organizationId: string,
  customerId: string,
  attempt: number,
): DetailState {
  const path = customerPath(organizationId, customerId);
  const key = `${path}|${attempt}`;
  const [result, setResult] = useState<DetailResult | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getBrowserAuth()
      .api.get<unknown>(path, { signal: controller.signal })
      .then((json) => {
        if (controller.signal.aborted) return;
        const customer = parseCustomer(json);
        setResult(
          customer === null
            ? { key, status: "error" }
            : { key, status: "ready", customer },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          status:
            isApiError(error) && error.kind === "not_found"
              ? "not_found"
              : "error",
        });
      });
    return () => controller.abort();
  }, [enabled, key, path]);

  if (result === null || result.key !== key) return { status: "loading" };
  if (result.status === "ready") {
    return { status: "ready", customer: result.customer };
  }
  return { status: result.status };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words text-sm">{children ?? "—"}</dd>
    </div>
  );
}

export function CustomerDetailView() {
  const { state } = useOrg();
  const params = useParams<{ customerId: string }>();
  const customerId =
    typeof params.customerId === "string" ? params.customerId : "";
  const [attempt, setAttempt] = useState(0);

  const ready = state.status === "ready";
  const organizationId = state.status === "ready" ? state.organization.id : "";
  const allowed = state.status === "ready" && can(state.role, "customer:read");
  const detail = useCustomer(
    allowed && customerId !== "",
    organizationId,
    customerId,
    attempt,
  );

  if (!ready) return null;

  const backButton = (
    <Button asChild variant="outline" size="sm">
      <Link href="/customers">Back to customers</Link>
    </Button>
  );

  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Customer" current="Customer" />
        <EmptyState
          title="You do not have access to customers"
          description="Ask an owner or admin of your organization if you need it."
        />
      </div>
    );
  }

  if (detail.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Customer" current="Customer" />
        <LoadingState rows={4} />
      </div>
    );
  }

  if (detail.status === "not_found") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Customer" current="Not found" />
        <EmptyState
          title="Customer not found"
          description="It may have been removed, or the link is wrong."
          action={backButton}
        />
      </div>
    );
  }

  if (detail.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Customer" current="Customer" />
        <ErrorState
          title="We could not load this customer"
          message="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  const { customer } = detail;
  const label = customerLabel(customer);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={label}
        description={`${capitalize(customer.customerType)} customer`}
        current={label}
      />
      <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Customer details</p>
          <StatusBadge status={customer.status} />
        </div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Type">{capitalize(customer.customerType)}</Field>
          <Field label="Company">{customer.companyName}</Field>
          <Field label="First name">{customer.firstName}</Field>
          <Field label="Last name">{customer.lastName}</Field>
          <Field label="Display name">{customer.displayName}</Field>
          <Field label="Source">{customer.source}</Field>
          <Field label="Email">{customer.email}</Field>
          <Field label="Phone">{customer.phone}</Field>
          <Field label="Added">{formatDate(customer.createdAt)}</Field>
        </dl>
      </div>
      <div>{backButton}</div>
    </div>
  );
}
