import { describe, expect, it } from "vitest";
import { LOGIN_PATH } from "../auth/auth-config";
import { decideAppView, type OrgState } from "./access-state";
import type { OrganizationSummary } from "./org-context";

const authStatuses = [
  "loading",
  "authenticated",
  "anonymous",
  "unavailable",
] as const;

function organization(
  status: OrganizationSummary["status"],
): OrganizationSummary {
  return {
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    status,
    currency: "NGN",
  };
}

function ready(status: OrganizationSummary["status"]): OrgState {
  return {
    status: "ready",
    organization: organization(status),
    organizations: [organization(status)],
    role: "owner",
  };
}

const orgStates: OrgState[] = [
  { status: "idle" },
  { status: "loading" },
  { status: "error" },
  { status: "none" },
  { status: "no_role", organization: organization("active") },
  ready("active"),
  ready("pending_setup"),
  ready("suspended"),
  ready("cancelled"),
];

describe("decideAppView: the session comes first", () => {
  it("shows nothing while the session is loading, whatever else is known", () => {
    for (const org of orgStates) {
      expect(decideAppView("loading", org)).toEqual({ kind: "blank" });
    }
  });

  it("offers a retry for the session when the server was unreachable", () => {
    for (const org of orgStates) {
      expect(decideAppView("unavailable", org)).toEqual({
        kind: "retry",
        what: "session",
      });
    }
  });

  it("sends an anonymous visitor to the login page", () => {
    for (const org of orgStates) {
      expect(decideAppView("anonymous", org)).toEqual({
        kind: "redirect",
        to: LOGIN_PATH,
      });
    }
  });
});

describe("decideAppView: signed in", () => {
  it("shows nothing until the organization has been loaded", () => {
    expect(decideAppView("authenticated", { status: "idle" })).toEqual({
      kind: "blank",
    });
    expect(decideAppView("authenticated", { status: "loading" })).toEqual({
      kind: "blank",
    });
  });

  it("offers a retry when the organization could not be loaded", () => {
    expect(decideAppView("authenticated", { status: "error" })).toEqual({
      kind: "retry",
      what: "organization",
    });
  });

  it("starts onboarding for a person with no organization", () => {
    expect(decideAppView("authenticated", { status: "none" })).toEqual({
      kind: "onboarding",
    });
  });

  it("explains when the person is not a member of the organization", () => {
    const view = decideAppView("authenticated", {
      status: "no_role",
      organization: organization("active"),
    });
    expect(view).toEqual({
      kind: "no_access",
      organization: organization("active"),
    });
  });

  it("shows the page for an active organization", () => {
    expect(decideAppView("authenticated", ready("active"))).toEqual({
      kind: "page",
      banner: null,
    });
  });

  it("shows the page with a setup banner for an organization still being set up", () => {
    expect(decideAppView("authenticated", ready("pending_setup"))).toEqual({
      kind: "page",
      banner: "setup",
    });
  });

  it("blocks a suspended or cancelled organization", () => {
    expect(decideAppView("authenticated", ready("suspended"))).toEqual({
      kind: "blocked",
      status: "suspended",
    });
    expect(decideAppView("authenticated", ready("cancelled"))).toEqual({
      kind: "blocked",
      status: "cancelled",
    });
  });
});

describe("decideAppView: protection", () => {
  it("shows a page only for a signed-in person with a usable organization", () => {
    for (const auth of authStatuses) {
      for (const org of orgStates) {
        const usable =
          auth === "authenticated" &&
          org.status === "ready" &&
          (org.organization.status === "active" ||
            org.organization.status === "pending_setup");
        const view = decideAppView(auth, org);
        expect(view.kind === "page", `${auth} / ${org.status}`).toBe(usable);
      }
    }
  });
});
