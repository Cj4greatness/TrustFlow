"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { FormAlert } from "@/components/auth/form-alert";
import { CustomerFormFields } from "@/components/customers/customer-form-fields";
import { useCustomer } from "@/components/customers/use-customer";
import { Button } from "@/components/ui/button";
import type { FormErrors } from "@/lib/auth/auth-forms";
import { getBrowserAuth } from "@/lib/auth/browser";
import { can } from "@/lib/auth/permissions";
import {
  customerToFormValues,
  toUpdatePayload,
} from "@/lib/customers/customer-edit";
import {
  describeCustomerError,
  validateCustomerForm,
  type CustomerField,
  type CustomerFormValues,
} from "@/lib/customers/customer-form";
import {
  customerLabel,
  customerPath,
  type Customer,
} from "@/lib/customers/customers";

type Phase = "idle" | "submitting" | "done";

function EditCustomerForm({
  organizationId,
  customer,
}: {
  organizationId: string;
  customer: Customer;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CustomerFormValues>(() =>
    customerToFormValues(customer),
  );
  const [fieldErrors, setFieldErrors] = useState<FormErrors<CustomerField>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const inFlight = useRef(false);
  const busy = phase !== "idle";
  const detailHref = `/customers/${encodeURIComponent(customer.id)}`;

  function update<K extends keyof CustomerFormValues>(
    field: K,
    value: CustomerFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const clientErrors = validateCustomerForm(values);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setGeneral([]);
      return;
    }

    const payload = toUpdatePayload(values, customer);
    if (Object.keys(payload).length === 0) {
      setGeneral([]);
      setNotice("There are no changes to save.");
      return;
    }

    inFlight.current = true;
    setPhase("submitting");
    setFieldErrors({});
    setGeneral([]);
    setNotice(null);
    try {
      await getBrowserAuth().api.patch<unknown>(
        customerPath(organizationId, customer.id),
        { body: payload },
      );
      setPhase("done");
      router.push(detailHref);
    } catch (error) {
      const failure = describeCustomerError(error);
      setFieldErrors(failure.fields);
      setGeneral(failure.general);
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  const buttonLabel =
    phase === "submitting"
      ? "Saving…"
      : phase === "done"
        ? "Saved"
        : "Save changes";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Edit customer"
        description={customerLabel(customer)}
        current="Edit customer"
      />

      <form
        noValidate
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-col gap-5 rounded-xl border border-border bg-card p-6"
      >
        {general.length > 0 ? (
          <FormAlert>
            {general.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </FormAlert>
        ) : null}
        {notice ? <FormAlert variant="info">{notice}</FormAlert> : null}

        <CustomerFormFields
          values={values}
          errors={fieldErrors}
          busy={busy}
          mode="edit"
          onChange={update}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {buttonLabel}
          </Button>
          <Button asChild variant="outline">
            <Link href={detailHref}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}

export function EditCustomerView() {
  const { state } = useOrg();
  const params = useParams<{ customerId: string }>();
  const customerId =
    typeof params.customerId === "string" ? params.customerId : "";
  const [attempt, setAttempt] = useState(0);

  const ready = state.status === "ready";
  const organizationId = state.status === "ready" ? state.organization.id : "";
  const allowed =
    state.status === "ready" && can(state.role, "customer:update");
  const detail = useCustomer(
    allowed && customerId !== "",
    organizationId,
    customerId,
    attempt,
  );

  if (!ready) return null;

  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Edit customer" current="Edit customer" />
        <EmptyState
          title="You do not have access to edit customers"
          description="Ask an owner or admin of your organization if you need it."
        />
      </div>
    );
  }

  if (detail.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Edit customer" current="Edit customer" />
        <LoadingState rows={4} />
      </div>
    );
  }

  if (detail.status === "not_found") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Edit customer" current="Not found" />
        <EmptyState
          title="Customer not found"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/customers">Back to customers</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (detail.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Edit customer" current="Edit customer" />
        <ErrorState
          title="We could not load this customer"
          message="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  return (
    <EditCustomerForm
      key={detail.customer.id}
      organizationId={organizationId}
      customer={detail.customer}
    />
  );
}
