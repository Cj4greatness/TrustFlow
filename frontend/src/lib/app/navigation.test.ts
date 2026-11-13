import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES, type Role } from "../auth/permissions";
import {
  breadcrumbsFor,
  NAV_SECTIONS,
  visibleNavigation,
  type NavItem,
} from "./navigation";

const allItems = NAV_SECTIONS.flatMap((section) => section.items);
const idsOf = (sections: ReturnType<typeof visibleNavigation>) =>
  sections.flatMap((section) => section.items.map((item) => item.id));
const canSee = (role: Role, item: NavItem) =>
  item.permission === undefined || can(role, item.permission);

describe("visibleNavigation", () => {
  it("shows nothing without a valid role", () => {
    for (const role of [null, undefined, "", "intern"]) {
      expect(visibleNavigation(role, { includePlanned: true })).toEqual([]);
    }
  });

  it("shows only built pages the role may see by default", () => {
    for (const role of ROLES) {
      const expected = allItems
        .filter((item) => item.ready && canSee(role, item))
        .map((item) => item.id);
      expect(idsOf(visibleNavigation(role)), role).toEqual(expected);
    }
  });

  it("shows the owner every item, in order, when planned pages are included", () => {
    const sections = visibleNavigation("owner", { includePlanned: true });
    expect(idsOf(sections)).toEqual(allItems.map((item) => item.id));
  });

  it("hides every item the role cannot read", () => {
    for (const role of ROLES) {
      const shown = new Set(
        idsOf(visibleNavigation(role, { includePlanned: true })),
      );
      for (const item of allItems) {
        expect(shown.has(item.id), `${role} / ${item.id}`).toBe(
          canSee(role, item),
        );
      }
    }
  });

  it("drops sections that end up empty", () => {
    for (const role of ROLES) {
      for (const section of visibleNavigation(role, { includePlanned: true })) {
        expect(section.items.length).toBeGreaterThan(0);
      }
      for (const section of visibleNavigation(role)) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("shows the dashboard to every role, as a built page", () => {
    const dashboard = allItems.find((item) => item.id === "dashboard");
    expect(dashboard?.ready).toBe(true);
    expect(dashboard?.permission).toBeUndefined();
    for (const role of ROLES) {
      expect(idsOf(visibleNavigation(role))).toContain("dashboard");
    }
  });

  it("builds the customers page and asks for customer:read", () => {
    const customers = allItems.find((item) => item.id === "customers");
    expect(customers?.ready).toBe(true);
    expect(customers?.permission).toBe("customer:read");
  });

  it("shows Audit Logs only to roles that can update the organization", () => {
    for (const role of ROLES) {
      const ids = idsOf(visibleNavigation(role, { includePlanned: true }));
      expect(ids.includes("audit-logs"), role).toBe(
        can(role, "organization:update"),
      );
    }
  });

  it("shows the Communication Hub to every role, as a planned item", () => {
    const hub = allItems.find((item) => item.id === "communication-hub");
    expect(hub?.permission).toBeUndefined();
    expect(hub?.ready).toBe(false);
    for (const role of ROLES) {
      const ids = idsOf(visibleNavigation(role, { includePlanned: true }));
      expect(ids).toContain("communication-hub");
    }
  });
});

describe("NAV_SECTIONS", () => {
  it("follows the approved grouping", () => {
    expect(NAV_SECTIONS.map((section) => section.id)).toEqual([
      "overview",
      "business-operations",
      "commerce-finance",
      "growth-engagement",
      "intelligence",
      "administration",
    ]);
  });

  it("has unique ids and root-relative hrefs", () => {
    const ids = allItems.map((item) => item.id);
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
  });

  it("only asks for permissions that exist", () => {
    for (const item of allItems) {
      if (item.permission !== undefined) {
        expect(PERMISSIONS).toContain(item.permission);
      }
    }
  });
});

describe("breadcrumbsFor", () => {
  it("starts at TrustFlow and ends at the current page", () => {
    expect(breadcrumbsFor("/dashboard")).toEqual([
      { label: "TrustFlow", href: "/dashboard" },
      { label: "Dashboard" },
    ]);
  });

  it("matches pages below a section path", () => {
    expect(breadcrumbsFor("/customers/42").map((crumb) => crumb.label)).toEqual(
      ["TrustFlow", "Customers"],
    );
  });

  it("falls back to the root crumb for an unknown path", () => {
    expect(breadcrumbsFor("/nowhere")).toEqual([
      { label: "TrustFlow", href: "/dashboard" },
    ]);
  });
});
