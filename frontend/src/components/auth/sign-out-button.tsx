"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { LOGIN_PATH } from "@/lib/auth/auth-config";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();
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
      // The request never reached the server, so the cookie was not cleared.
      setProblem(
        "We could not reach the server to finish signing you out. You may still be signed in. Please try again.",
      );
      setSigningOut(false);
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={signingOut}
        aria-busy={signingOut}
        onClick={onSignOut}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
      {problem ? (
        <p
          role="alert"
          className="max-w-xs text-right text-xs text-destructive"
        >
          {problem}
        </p>
      ) : null}
    </div>
  );
}
