// What the signed-in app shows, decided from two things: who is signed in and
// which organization (and role) they are working in. Pure and tested; the
// route guard component only renders what this returns.

import { LOGIN_PATH } from "../auth/auth-config";
import type { AuthState } from "../auth/auth-state";
import type { Role } from "../auth/permissions";
import {
  statusAction,
  type OrganizationStatus,
  type OrganizationSummary,
} from "./org-context";

export type OrgState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "none" }
  | {
      status: "ready";
      organization: OrganizationSummary;
      organizations: readonly OrganizationSummary[];
      role: Role;
    }
  | { status: "no_role"; organization: OrganizationSummary };

export type AppView =
  | { kind: "blank" }
  | { kind: "redirect"; to: string }
  | { kind: "retry"; what: "session" | "organization" }
  | { kind: "onboarding" }
  | { kind: "no_access"; organization: OrganizationSummary }
  | { kind: "blocked"; status: OrganizationStatus }
  | { kind: "page"; banner: "setup" | null };

export function decideAppView(
  auth: AuthState["status"],
  org: OrgState,
): AppView {
  switch (auth) {
    case "loading":
      return { kind: "blank" };
    case "unavailable":
      return { kind: "retry", what: "session" };
    case "anonymous":
      return { kind: "redirect", to: LOGIN_PATH };
    case "authenticated":
      break;
  }

  switch (org.status) {
    case "idle":
    case "loading":
      return { kind: "blank" };
    case "error":
      return { kind: "retry", what: "organization" };
    case "none":
      return { kind: "onboarding" };
    case "no_role":
      return { kind: "no_access", organization: org.organization };
    case "ready": {
      const action = statusAction(org.organization.status);
      if (action === "blocked") {
        return { kind: "blocked", status: org.organization.status };
      }
      return { kind: "page", banner: action === "setup" ? "setup" : null };
    }
  }
}
