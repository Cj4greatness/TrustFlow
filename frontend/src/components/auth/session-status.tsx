"use client";

// Temporary signed-in indicator for the placeholder home page. It gives logout
// a real place to be exercised; remove it when the app shell exists.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { LOGIN_PATH, REGISTER_PATH } from "@/lib/auth/auth-config";

export function SessionStatus() {
  const router = useRouter();
  const { state, logout, retry } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onSignOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSigningOut(true);
    setProblem(null);
    try {
      await logout();
      router.replace(LOGIN_PATH);
    } catch {
      // The request never reached the server, so the cookie was not cleared
      // and the session may still be restored on the next page load.
      setProblem(
        "We could not reach the server to finish signing you out. You may still be signed in. Please try again.",
      );
      setSigningOut(false);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="mt-6 flex max-w-sm flex-col items-center gap-3 text-center">
      {problem ? <FormAlert>{problem}</FormAlert> : null}

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your session…
        </p>
      ) : null}

      {state.status === "authenticated" ? (
        <>
          <p className="text-sm">
            Signed in as{" "}
            <span className="font-medium">{state.user.firstName}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={onSignOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </>
      ) : null}

      {state.status === "anonymous" ? (
        <p className="text-sm text-muted-foreground">
          You are not signed in.{" "}
          <Link
            href={LOGIN_PATH}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>{" "}
          or{" "}
          <Link
            href={REGISTER_PATH}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            create an account
          </Link>
          .
        </p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          We could not check your session.{" "}
          <button
            type="button"
            onClick={retry}
            className="font-medium text-primary underline underline-offset-4"
          >
            Try again
          </button>
        </p>
      ) : null}
    </div>
  );
}
