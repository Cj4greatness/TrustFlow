"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import {
  capitalize,
  formatDate,
  StatusBadge,
} from "@/components/customers/customers-view";
import { useCustomer } from "@/components/customers/use-customer";
import { Button } from "@/components/ui/button";
import { getBrowserAuth } from "@/lib/auth/browser";
import { can } from "@/lib/auth/permissions";
import { describeDeleteError } from "@/lib/customers/customer-delete";
import { customerLabel, customerPath } from "@/lib/customers/customers";

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
  const router = useRouter();
  const { state } = useOrg();
  const params = useParams<{ customerId: string }>();
  const customerId =
    typeof params.customerId === "string" ? params.customerId : "";
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const ready = state.status === "ready";
  const organizationId = state.status === "ready" ? state.organization.id : "";
  const allowed = state.status === "ready" && can(state.role, "customer:read");
  const canUpdate =
    state.status === "ready" && can(state.role, "customer:update");
  const canDelete =
    state.status === "ready" && can(state.role, "customer:delete");
  const detail = useCustomer(
    allowed && customerId !== "",
    organizationId,
    customerId,
    attempt,
  );

  if (!ready) return null;

  function openConfirm() {
    setDeleteError(null);
    setConfirming(true);
  }

  function closeConfirm() {
    if (!deleting) setConfirming(false);
  }

  async function onDelete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await getBrowserAuth().api.delete<unknown>(
        customerPath(organizationId, customerId),
      );
      router.push("/customers");
    } catch (error) {
      const outcome = describeDeleteError(error);
      if (outcome.kind === "gone") {
        router.push("/customers");
      } else {
        setDeleteError(outcome.message);
        setDeleting(false);
      }
    } finally {
      inFlight.current = false;
    }
  }

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
        action={
          canUpdate || canDelete ? (
            <div className="flex items-center gap-2">
              {canUpdate ? (
                <Button asChild>
                  <Link
                    href={`/customers/${encodeURIComponent(customer.id)}/edit`}
                  >
                    Edit
                  </Link>
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={openConfirm}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
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

      <ConfirmDialog
        open={confirming}
        title={`Delete ${label}?`}
        confirmLabel="Delete customer"
        busyLabel="Deleting…"
        busy={deleting}
        error={deleteError}
        onConfirm={onDelete}
        onCancel={closeConfirm}
      >
        <p>
          This customer will be removed from your customer lists. This cannot be
          undone in TrustFlow.
        </p>
        <p>
          If you only want to stop working with them, set their status to
          Archived instead.
        </p>
      </ConfirmDialog>
    </div>
  );
}
