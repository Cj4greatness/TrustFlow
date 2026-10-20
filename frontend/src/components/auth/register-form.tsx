"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { AUTH_REDIRECT_PATH, LOGIN_PATH } from "@/lib/auth/auth-config";
import {
  describeAuthError,
  REGISTER_FIELDS,
  toRegisterPayload,
  validateRegister,
  type FormErrors,
  type RegisterField,
  type RegisterValues,
} from "@/lib/auth/auth-forms";

type Phase = "idle" | "submitting" | "redirecting";

const EMPTY_VALUES: RegisterValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
};

export function RegisterForm() {
  const router = useRouter();
  const { state, register } = useAuth();
  const [values, setValues] = useState<RegisterValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FormErrors<RegisterField>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const inFlight = useRef(false);

  // Registration signs the user in, so the same redirect applies as for login.
  useEffect(() => {
    if (state.status === "authenticated") router.replace(AUTH_REDIRECT_PATH);
  }, [state.status, router]);

  if (state.status === "loading" || state.status === "authenticated") {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        {state.status === "loading" ? "Loading…" : "Redirecting…"}
      </p>
    );
  }

  const busy = phase !== "idle";

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const clientErrors = validateRegister(values);
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
      await register(toRegisterPayload(values));
      setPhase("redirecting");
    } catch (error) {
      const failure = describeAuthError(error, "register", REGISTER_FIELDS);
      const errors: FormErrors<RegisterField> = {};
      for (const field of REGISTER_FIELDS) {
        const messages = failure.fields[field];
        if (messages?.length) errors[field] = messages.join(" ");
      }
      setFieldErrors(errors);
      setGeneral(failure.general);
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  const buttonLabel =
    phase === "submitting"
      ? "Creating account…"
      : phase === "redirecting"
        ? "Redirecting…"
        : "Create account";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Set up TrustFlow for your business.
        </p>
      </div>

      {general.length > 0 ? (
        <FormAlert>
          {general.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </FormAlert>
      ) : null}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="firstName"
            name="firstName"
            label="First name"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            error={fieldErrors.firstName}
            readOnly={busy}
          />
          <FormField
            id="lastName"
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            error={fieldErrors.lastName}
            readOnly={busy}
          />
        </div>
        <FormField
          id="email"
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
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
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => update("phone", event.target.value)}
          error={fieldErrors.phone}
          readOnly={busy}
        />
        <FormField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          value={values.password}
          onChange={(event) => update("password", event.target.value)}
          error={fieldErrors.password}
          readOnly={busy}
        />
        <Button
          type="submit"
          size="lg"
          disabled={busy}
          aria-busy={busy}
          className="w-full"
        >
          {buttonLabel}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={LOGIN_PATH}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
