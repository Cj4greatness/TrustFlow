"use client";

// Decides what the signed-in area shows, using the tested rules in
// lib/app/access-state. Every state is rendered here and nowhere else.

import { useRouter } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { useOrg } from "@/components/app/org-provider";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { useAuth } from "@/components/auth/auth-provider";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { decideAppView } from "@/lib/app/access-state";

function CenteredCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function AppGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state: auth, retry: retrySession } = useAuth();
  const { state: org, reload: reloadOrganization } = useOrg();
  const view = decideAppView(auth.status, org);
  const redirectTo = view.kind === "redirect" ? view.to : null;

  useEffect(() => {
    if (redirectTo !== null) router.replace(redirectTo);
  }, [redirectTo, router]);

  switch (view.kind) {
    case "blank":
    case "redirect":
      return (
        <p role="status" className="sr-only">
          Loading…
        </p>
      );

    case "retry":
      return (
        <CenteredCard
          title={
            view.what === "session"
              ? "We could not check your session"
              : "We could not load your organization"
          }
        >
          <p className="text-sm text-muted-foreground">
            Check your connection and try again.
          </p>
          <Button
            type="button"
            onClick={
              view.what === "session" ? retrySession : reloadOrganization
            }
          >
            Try again
          </Button>
        </CenteredCard>
      );

    case "onboarding":
      return (
        <CenteredCard title="Create your organization">
          <p className="text-sm text-muted-foreground">
            You are not part of an organization yet. Creating one will be
            available here soon.
          </p>
          <div className="flex justify-end">
            <SignOutButton />
          </div>
        </CenteredCard>
      );

    case "no_access":
      return (
        <CenteredCard title="No access">
          <p className="text-sm text-muted-foreground">
            You are not listed as a member of {view.organization.name}.
          </p>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={reloadOrganization}
            >
              Try again
            </Button>
            <SignOutButton />
          </div>
        </CenteredCard>
      );

    case "blocked": {
      const name =
        org.status === "ready" ? org.organization.name : "This organization";
      return (
        <CenteredCard title={`${name} cannot be opened`}>
          <p className="text-sm text-muted-foreground">
            {view.status === "suspended"
              ? "This organization is suspended, so it cannot be opened right now."
              : "This organization has been cancelled, so it cannot be opened."}
          </p>
          <div className="flex items-center justify-between gap-3">
            <OrgSwitcher />
            <SignOutButton />
          </div>
        </CenteredCard>
      );
    }

    case "page": {
      // Keyed by organization, so switching drops everything from the old one.
      const organizationId = org.status === "ready" ? org.organization.id : "";
      return (
        <AppShell banner={view.banner}>
          <Fragment key={organizationId}>{children}</Fragment>
        </AppShell>
      );
    }
  }
}
