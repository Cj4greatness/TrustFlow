// Loads the organization state the app shell needs after sign-in: the
// person's organizations, the one they are working in, and their role there.
// Takes a plain `get` function instead of the whole API client so it can be
// tested without a network.

import type { OrgState } from "./access-state";
import {
  chooseActiveOrganization,
  findRole,
  parseMembers,
  parseOrganizations,
} from "./org-context";

export type GetJson = (
  path: string,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

export type LoadOrgStateInput = {
  get: GetJson;
  userId: string;
  /** The organization chosen last time, if any. */
  preferredOrganizationId: string | null;
  signal?: AbortSignal;
};

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Never throws, except to pass on an abort: a cancelled request must not show
 * up as an error screen. Every other failure becomes the "error" state, which
 * the guard turns into a retry button.
 */
export async function loadOrgState(
  input: LoadOrgStateInput,
): Promise<OrgState> {
  const { get, userId, preferredOrganizationId, signal } = input;
  try {
    const organizations = parseOrganizations(
      await get("/organizations/me", { signal }),
    );
    if (organizations === null) return { status: "error" };

    const organization = chooseActiveOrganization(
      organizations,
      preferredOrganizationId,
    );
    if (organization === null) return { status: "none" };

    const members = parseMembers(
      await get(
        `/organizations/${encodeURIComponent(organization.id)}/members`,
        {
          signal,
        },
      ),
    );
    if (members === null) return { status: "error" };

    const role = findRole(members, userId);
    if (role === null) return { status: "no_role", organization };

    return { status: "ready", organization, organizations, role };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { status: "error" };
  }
}
