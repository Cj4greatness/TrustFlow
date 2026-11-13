"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import type { FormErrors } from "@/lib/auth/auth-forms";
import { getBrowserAuth } from "@/lib/auth/browser";
import { can } from "@/lib/auth/permissions";
import {
  describeCustomerError,
  EMPTY_CUSTOMER_FORM,
  toCreatePayload,
  validateCustomerForm,
  type CustomerField,
  type CustomerFormValues,
} from "@/lib/customers/customer-form";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  type CustomerStatus,
} from "@/lib/customers/customers";
import { cn } from "@/lib/utils";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

type Phase = "idle" | "submitting" | "done";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function NewCustomerView() {
  const router = useRouter();
  const { state } = useOrg();
  const [values, setValues] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<CustomerField>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const inFlight = useRef(false);

  if (state.status !== "ready") return null;

  const organizationId = state.organization.id;
  const allowed = can(state.role, "customer:create");
  const busy = phase !== "idle";

  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Add customer" current="Add customer" />
        <EmptyState
          title="You do not have access to add customers"
          description="Ask an owner or admin of your organization if you need it."
        />
      </div>
    );
  }

  function update<K extends keyof CustomerFormValues>(
    field: K,
    value: CustomerFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
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

    inFlight.current = true;
    setPhase("submitting");
    setFieldErrors({});
    setGeneral([]);
    try {
      await getBrowserAuth().api.post<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/customers`,
        { body: toCreatePayload(values) },
      );
      setPhase("done");
      router.push("/customers");
    } catch (error) {
      const failure = describeCustomerError(error);
      setFieldErrors(failure.fields);
      setGeneral(failure.general);
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  const business = values.customerType === "business";
  const buttonLabel =
    phase === "submitting"
      ? "Adding…"
      : phase === "done"
        ? "Added"
        : "Add customer";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add customer"
        description="Register a person or a business you sell to."
        current="Add customer"
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

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Customer type</legend>
          <div className="grid grid-cols-2 gap-3">
            {CUSTOMER_TYPES.map((type) => (
              <label
                key={type}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5",
                  busy && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="customerType"
                  value={type}
                  checked={values.customerType === type}
                  onChange={() => update("customerType", type)}
                  disabled={busy}
                  className="accent-primary"
                />
                {capitalize(type)}
              </label>
            ))}
          </div>
          {fieldErrors.customerType ? (
            <p className="text-sm text-destructive">
              {fieldErrors.customerType}
            </p>
          ) : null}
        </fieldset>

        {business ? (
          <FormField
            id="companyName"
            name="companyName"
            label="Company name"
            autoComplete="organization"
            value={values.companyName}
            onChange={(event) => update("companyName", event.target.value)}
            error={fieldErrors.companyName}
            readOnly={busy}
          />
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="firstName"
            name="firstName"
            label={business ? "Contact first name (optional)" : "First name"}
            autoComplete="off"
            value={values.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            error={fieldErrors.firstName}
            readOnly={busy}
          />
          <FormField
            id="lastName"
            name="lastName"
            label={business ? "Contact last name (optional)" : "Last name"}
            autoComplete="off"
            value={values.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            error={fieldErrors.lastName}
            readOnly={busy}
          />
        </div>

        <FormField
          id="displayName"
          name="displayName"
          label="Display name (optional)"
          hint="Shown in lists instead of the full name."
          autoComplete="off"
          value={values.displayName}
          onChange={(event) => update("displayName", event.target.value)}
          error={fieldErrors.displayName}
          readOnly={busy}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="email"
            name="email"
            label="Email (optional)"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            error={fieldErrors.email}
            readOnly={busy}
          />
          <FormField
            id="phone"
            name="phone"
            label="Phone (optional)"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
            error={fieldErrors.phone}
            readOnly={busy}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="source"
            name="source"
            label="Source (optional)"
            hint="For example Referral or Instagram."
            autoComplete="off"
            value={values.source}
            onChange={(event) => update("source", event.target.value)}
            error={fieldErrors.source}
            readOnly={busy}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={values.status}
              onChange={(event) =>
                update("status", event.target.value as CustomerStatus)
              }
              disabled={busy}
              aria-invalid={fieldErrors.status ? true : undefined}
              className={SELECT}
            >
              {CUSTOMER_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {capitalize(option)}
                </option>
              ))}
            </select>
            {fieldErrors.status ? (
              <p className="text-sm text-destructive">{fieldErrors.status}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {buttonLabel}
          </Button>
          <Button asChild variant="outline">
            <Link href="/customers">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
