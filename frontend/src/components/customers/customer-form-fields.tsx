import { FormField } from "@/components/auth/form-field";
import { capitalize } from "@/components/customers/customers-view";
import type { FormErrors } from "@/lib/auth/auth-forms";
import type {
  CustomerField,
  CustomerFormValues,
} from "@/lib/customers/customer-form";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  type CustomerStatus,
} from "@/lib/customers/customers";
import { cn } from "@/lib/utils";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The fields of the customer form, shared by "Add customer" and "Edit
 * customer". In edit mode the type is shown but cannot be changed.
 */
export function CustomerFormFields({
  values,
  errors,
  busy,
  mode,
  onChange,
}: {
  values: CustomerFormValues;
  errors: FormErrors<CustomerField>;
  busy: boolean;
  mode: "create" | "edit";
  onChange: <K extends keyof CustomerFormValues>(
    field: K,
    value: CustomerFormValues[K],
  ) => void;
}) {
  const business = values.customerType === "business";
  return (
    <>
      {mode === "create" ? (
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
                  onChange={() => onChange("customerType", type)}
                  disabled={busy}
                  className="accent-primary"
                />
                {capitalize(type)}
              </label>
            ))}
          </div>
          {errors.customerType ? (
            <p className="text-sm text-destructive">{errors.customerType}</p>
          ) : null}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Customer type</p>
          <p className="text-sm text-muted-foreground">
            {capitalize(values.customerType)} (cannot be changed)
          </p>
        </div>
      )}

      {business ? (
        <FormField
          id="companyName"
          name="companyName"
          label="Company name"
          autoComplete="organization"
          value={values.companyName}
          onChange={(event) => onChange("companyName", event.target.value)}
          error={errors.companyName}
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
          onChange={(event) => onChange("firstName", event.target.value)}
          error={errors.firstName}
          readOnly={busy}
        />
        <FormField
          id="lastName"
          name="lastName"
          label={business ? "Contact last name (optional)" : "Last name"}
          autoComplete="off"
          value={values.lastName}
          onChange={(event) => onChange("lastName", event.target.value)}
          error={errors.lastName}
          readOnly={busy}
        />
      </div>

      <FormField
        id="displayName"
        name="displayName"
        label="Display name (optional)"
        hint={
          mode === "edit"
            ? "Shown in lists. Clear it to build it from the name again."
            : "Shown in lists instead of the full name."
        }
        autoComplete="off"
        value={values.displayName}
        onChange={(event) => onChange("displayName", event.target.value)}
        error={errors.displayName}
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
          onChange={(event) => onChange("email", event.target.value)}
          error={errors.email}
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
          onChange={(event) => onChange("phone", event.target.value)}
          error={errors.phone}
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
          onChange={(event) => onChange("source", event.target.value)}
          error={errors.source}
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
              onChange("status", event.target.value as CustomerStatus)
            }
            disabled={busy}
            aria-invalid={errors.status ? true : undefined}
            className={SELECT}
          >
            {CUSTOMER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {capitalize(option)}
              </option>
            ))}
          </select>
          {errors.status ? (
            <p className="text-sm text-destructive">{errors.status}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
