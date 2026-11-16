"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useOrg } from "@/components/app/org-provider";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { FormAlert } from "@/components/auth/form-alert";
import { CustomerFormFields } from "@/components/customers/customer-form-fields";
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

type Phase = "idle" | "submitting" | "done";

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

        <CustomerFormFields
          values={values}
          errors={fieldErrors}
          busy={busy}
          mode="create"
          onChange={update}
        />

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
