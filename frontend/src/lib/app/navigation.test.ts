import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLES } from "../auth/permissions";
import { NAV_SECTIONS, visibleNavigation } from "./navigation";

const allItems = NAV_SECTIONS.flatMap((section) => section.items);
const idsOf = (sections: ReturnType<typeof visibleNavigation>) =>
  sections.flatMap((section) => section.items.map((item) => item.id));

describe("visibleNavigation", () => {
  it("shows nothing without a valid role", () => {
    for (const role of [null, undefined, "", "intern"]) {
      expect(visibleNavigation(role, { includePlanned: true })).toEqual([]);
    }
  });

  it("shows only built pages by default", () => {
    const sections = visibleNavigation("owner");
    expect(idsOf(sections)).toEqual(["dashboard"]);
    expect(sections.map((section) => section.id)).toEqual(["overview"]);
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
        const allowed =
          item.permission === undefined || can(role, item.permission);
        expect(shown.has(item.id), `${role} / ${item.id}`).toBe(allowed);
      }
    }
  });

  it("drops sections that end up empty", () => {
    for (const role of ROLES) {
      for (const section of visibleNavigation(role, { includePlanned: true })) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    }
    expect(visibleNavigation("viewer").map((section) => section.id)).toEqual([
      "overview",
    ]);
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
      "business",
      "commerce",
      "management",
      "communication",
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
