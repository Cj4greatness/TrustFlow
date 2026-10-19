"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { FormAlert } from "@/components/auth/form-alert";
import { FormField } from "@/components/auth/form-field";
import { Button } from "@/components/ui/button";
import { AUTH_REDIRECT_PATH, REGISTER_PATH } from "@/lib/auth/auth-config";
import {
  describeAuthError,
  LOGIN_FIELDS,
  toLoginPayload,
  validateLogin,
  type FormErrors,
  type LoginField,
  type LoginValues,
} from "@/lib/auth/auth-forms";
import { describeSessionNotice } from "@/lib/auth/auth-state";

type Phase = "idle" | "submitting" | "redirecting";

export function LoginForm() {
  const router = useRouter();
  const { state, login, retry, dismissNotice } = useAuth();
  const [values, setValues] = useState<LoginValues>({
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FormErrors<LoginField>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const inFlight = useRef(false);

  // Signed-in visitors, and users who have just signed in, leave this page.
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

  function update(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const clientErrors = validateLogin(values);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setGeneral([]);
      return;
    }

    inFlight.current = true;
    setPhase("submitting");
    setFieldErrors({});
    setGeneral([]);
    dismissNotice();
    try {
      await login(toLoginPayload(values));
      setPhase("redirecting");
    } catch (error) {
      const failure = describeAuthError(error, "login", LOGIN_FIELDS);
      const errors: FormErrors<LoginField> = {};
      for (const field of LOGIN_FIELDS) {
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
      ? "Signing in…"
      : phase === "redirecting"
        ? "Redirecting…"
        : "Sign in";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back to TrustFlow.
        </p>
      </div>

      {state.status === "anonymous" && state.notice ? (
        <FormAlert variant="info">
          {describeSessionNotice(state.notice)}
        </FormAlert>
      ) : null}
      {state.status === "unavailable" ? (
        <FormAlert variant="info">
          <p>We could not check whether you are already signed in.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-1 font-medium underline underline-offset-4"
          >
            Try again
          </button>
        </FormAlert>
      ) : null}
      {general.length > 0 ? (
        <FormAlert>
          {general.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </FormAlert>
      ) : null}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
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
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
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
        New to TrustFlow?{" "}
        <Link
          href={REGISTER_PATH}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
