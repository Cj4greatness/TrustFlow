import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors";
import { loadOrgState, type GetJson } from "./org-loader";

function organization(id: string, status = "active") {
  return {
    id,
    name: id,
    slug: id,
    industry: "retail",
    country: "NG",
    timezone: "Africa/Lagos",
    currency: "NGN",
    logo: null,
    subscriptionPlan: "trial",
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function member(userId: string, role: string) {
  return {
    id: `member-${userId}`,
    role,
    joinedAt: "2026-01-01T00:00:00.000Z",
    user: { id: userId, firstName: "A", lastName: "B", email: "a@example.com" },
  };
}

function fake(routes: Record<string, unknown>) {
  const calls: Array<{ path: string; signal?: AbortSignal }> = [];
  const get: GetJson = async (path, options) => {
    calls.push({ path, signal: options?.signal });
    const result = routes[path];
    if (result instanceof Error) throw result;
    return result;
  };
  return { get, calls };
}

const summary = (id: string) => ({
  id,
  name: id,
  slug: id,
  status: "active",
  currency: "NGN",
});

describe("loadOrgState", () => {
  it("returns the organization and role for a member", async () => {
    const { get } = fake({
      "/organizations/me": [organization("org-1")],
      "/organizations/org-1/members": [member("user-1", "owner")],
    });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(state).toEqual({
      status: "ready",
      organization: summary("org-1"),
      organizations: [summary("org-1")],
      role: "owner",
    });
  });

  it("loads the members of the organization it chose, passing the abort signal", async () => {
    const controller = new AbortController();
    const { get, calls } = fake({
      "/organizations/me": [organization("org-1")],
      "/organizations/org-1/members": [member("user-1", "staff")],
    });
    await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
      signal: controller.signal,
    });
    expect(calls.map((call) => call.path)).toEqual([
      "/organizations/me",
      "/organizations/org-1/members",
    ]);
    expect(calls.every((call) => call.signal === controller.signal)).toBe(true);
  });

  it("prefers the organization chosen before", async () => {
    const { get, calls } = fake({
      "/organizations/me": [organization("a"), organization("b")],
      "/organizations/b/members": [member("user-1", "manager")],
    });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: "b",
    });
    expect(calls[1]?.path).toBe("/organizations/b/members");
    expect(state.status === "ready" && state.organization.id).toBe("b");
  });

  it("reports no organization when the list is empty, without asking for members", async () => {
    const { get, calls } = fake({ "/organizations/me": [] });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(state).toEqual({ status: "none" });
    expect(calls).toHaveLength(1);
  });

  it("reports an error when the organizations response is not a list", async () => {
    const { get } = fake({ "/organizations/me": {} });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(state).toEqual({ status: "error" });
  });

  it("reports an error when the members response is not usable", async () => {
    const { get } = fake({
      "/organizations/me": [organization("org-1")],
      "/organizations/org-1/members": {},
    });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(state).toEqual({ status: "error" });
  });

  it("reports no role when the person is not in the members list", async () => {
    const { get } = fake({
      "/organizations/me": [organization("org-1")],
      "/organizations/org-1/members": [member("user-2", "viewer")],
    });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(state).toEqual({
      status: "no_role",
      organization: summary("org-1"),
    });
  });

  it("reports an error when a request fails", async () => {
    const network = fake({
      "/organizations/me": new ApiError({ kind: "network", status: null }),
    });
    expect(
      await loadOrgState({
        get: network.get,
        userId: "user-1",
        preferredOrganizationId: null,
      }),
    ).toEqual({ status: "error" });

    const server = fake({
      "/organizations/me": [organization("org-1")],
      "/organizations/org-1/members": new ApiError({
        kind: "server",
        status: 500,
      }),
    });
    expect(
      await loadOrgState({
        get: server.get,
        userId: "user-1",
        preferredOrganizationId: null,
      }),
    ).toEqual({ status: "error" });
  });

  it("rethrows an abort instead of reporting an error", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const { get } = fake({ "/organizations/me": abort });
    await expect(
      loadOrgState({ get, userId: "user-1", preferredOrganizationId: null }),
    ).rejects.toBe(abort);
  });

  it("encodes the organization id in the path", async () => {
    const { get, calls } = fake({
      "/organizations/me": [organization("a/b")],
      "/organizations/a%2Fb/members": [member("user-1", "staff")],
    });
    const state = await loadOrgState({
      get,
      userId: "user-1",
      preferredOrganizationId: null,
    });
    expect(calls[1]?.path).toBe("/organizations/a%2Fb/members");
    expect(state.status).toBe("ready");
  });
});
