import { describe, expect, it } from "vitest";
import {
  chooseActiveOrganization,
  findRole,
  parseMembers,
  parseOrganizations,
  statusAction,
  type OrganizationSummary,
} from "./org-context";

// Shapes follow the live backend responses, with made-up ids and names.
const liveOrganization = {
  id: "org-1",
  name: "Test Org",
  slug: "test-org",
  industry: "retail",
  country: "NG",
  timezone: "Africa/Lagos",
  currency: "NGN",
  logo: null,
  subscriptionPlan: "trial",
  status: "pending_setup",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const liveMember = {
  id: "member-1",
  role: "owner",
  joinedAt: "2026-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    phone: null,
    avatar: null,
    status: "active",
    emailVerified: false,
    lastLogin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

function org(
  id: string,
  status: OrganizationSummary["status"],
): OrganizationSummary {
  return { id, name: id, slug: id, status, currency: "NGN" };
}

describe("parseOrganizations", () => {
  it("reads the live response shape and keeps what the shell needs", () => {
    expect(parseOrganizations([liveOrganization])).toEqual([
      {
        id: "org-1",
        name: "Test Org",
        slug: "test-org",
        status: "pending_setup",
        currency: "NGN",
      },
    ]);
  });

  it("treats an empty list as no organizations, not as an error", () => {
    expect(parseOrganizations([])).toEqual([]);
  });

  it("rejects anything that is not a list", () => {
    for (const body of [undefined, null, {}, "x", { data: [] }]) {
      expect(parseOrganizations(body)).toBeNull();
    }
  });

  it("skips malformed entries but keeps the valid ones", () => {
    const parsed = parseOrganizations([
      { ...liveOrganization, id: "bad-status", status: "mystery" },
      { id: 5 },
      null,
      liveOrganization,
    ]);
    expect(parsed?.map((entry) => entry.id)).toEqual(["org-1"]);
  });

  it("rejects a non-empty list where nothing is usable", () => {
    expect(parseOrganizations([{}, null])).toBeNull();
  });
});

describe("parseMembers", () => {
  it("reads the live response shape", () => {
    expect(parseMembers([liveMember])).toEqual([
      { role: "owner", userId: "user-1" },
    ]);
  });

  it("skips unknown roles and entries without a user id", () => {
    const parsed = parseMembers([
      { ...liveMember, role: "superuser" },
      { role: "staff" },
      { role: "staff", user: {} },
      {
        ...liveMember,
        role: "viewer",
        user: { ...liveMember.user, id: "user-2" },
      },
    ]);
    expect(parsed).toEqual([{ role: "viewer", userId: "user-2" }]);
  });

  it("rejects what is not a list, and a list where nothing is usable", () => {
    expect(parseMembers(undefined)).toBeNull();
    expect(parseMembers("x")).toBeNull();
    expect(parseMembers([{}])).toBeNull();
  });

  it("treats an empty list as no members", () => {
    expect(parseMembers([])).toEqual([]);
  });
});

describe("findRole", () => {
  const members = [
    { role: "owner", userId: "user-1" },
    { role: "viewer", userId: "user-2" },
  ] as const;

  it("finds the role by user id", () => {
    expect(findRole(members, "user-2")).toBe("viewer");
  });

  it("returns null when the user is not a member", () => {
    expect(findRole(members, "user-9")).toBeNull();
    expect(findRole([], "user-1")).toBeNull();
  });
});

describe("chooseActiveOrganization", () => {
  it("returns null when there are no organizations", () => {
    expect(chooseActiveOrganization([], null)).toBeNull();
    expect(chooseActiveOrganization([], "org-1")).toBeNull();
  });

  it("keeps the organization chosen before when it still exists", () => {
    const orgs = [org("a", "active"), org("b", "pending_setup")];
    expect(chooseActiveOrganization(orgs, "b")?.id).toBe("b");
  });

  it("ignores an unknown choice and prefers an active organization", () => {
    const orgs = [org("a", "pending_setup"), org("b", "active")];
    expect(chooseActiveOrganization(orgs, "gone")?.id).toBe("b");
    expect(chooseActiveOrganization(orgs, null)?.id).toBe("b");
  });

  it("ignores a cancelled choice", () => {
    const orgs = [org("a", "cancelled"), org("b", "active")];
    expect(chooseActiveOrganization(orgs, "a")?.id).toBe("b");
  });

  it("falls back to the first that is not cancelled, then to the first", () => {
    expect(
      chooseActiveOrganization(
        [org("a", "cancelled"), org("b", "suspended")],
        null,
      )?.id,
    ).toBe("b");
    expect(
      chooseActiveOrganization(
        [org("a", "cancelled"), org("b", "cancelled")],
        null,
      )?.id,
    ).toBe("a");
  });
});

describe("statusAction", () => {
  it("maps each status to what the shell does", () => {
    expect(statusAction("active")).toBe("ready");
    expect(statusAction("pending_setup")).toBe("setup");
    expect(statusAction("suspended")).toBe("blocked");
    expect(statusAction("cancelled")).toBe("blocked");
  });
});
