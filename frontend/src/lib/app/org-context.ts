// Which organization the person is working in, and what role they hold there.
// Pure functions over the two API responses, so the rules can be tested alone.
//
// The backend does not put the role on the organization. It is found in the
// members list: the entry whose user id matches the signed-in user.

import { isRole, type Role } from "../auth/permissions";

export const ORGANIZATION_STATUSES = [
  "active",
  "suspended",
  "pending_setup",
  "cancelled",
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/** The few fields the shell needs from GET /organizations/me. */
export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  currency: string;
};

/** The few fields the shell needs from GET /organizations/{id}/members. */
export type MemberRef = { role: Role; userId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOrganization(value: unknown): OrganizationSummary | null {
  if (!isRecord(value)) return null;
  const { id, name, slug, status, currency } = value;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || typeof slug !== "string") return null;
  if (typeof currency !== "string") return null;
  if (!(ORGANIZATION_STATUSES as readonly unknown[]).includes(status)) {
    return null;
  }
  return { id, name, slug, currency, status: status as OrganizationStatus };
}

/**
 * Reads the organizations list. An empty list is a valid answer (a person who
 * has not created an organization yet). Null means the response was not the
 * expected list at all, so the caller should show an error, not "no
 * organization".
 */
export function parseOrganizations(
  body: unknown,
): OrganizationSummary[] | null {
  if (!Array.isArray(body)) return null;
  const parsed = body
    .map(toOrganization)
    .filter((org): org is OrganizationSummary => org !== null);
  if (body.length > 0 && parsed.length === 0) return null;
  return parsed;
}

/** Reads the members list, keeping only entries with a valid role and user id. */
export function parseMembers(body: unknown): MemberRef[] | null {
  if (!Array.isArray(body)) return null;
  const members: MemberRef[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || !isRecord(entry.user)) continue;
    const role = entry.role;
    const userId = entry.user.id;
    if (isRole(role) && typeof userId === "string" && userId !== "") {
      members.push({ role, userId });
    }
  }
  if (body.length > 0 && members.length === 0) return null;
  return members;
}

/** The signed-in user's role in the organization, or null if not a member. */
export function findRole(
  members: readonly MemberRef[],
  userId: string,
): Role | null {
  return members.find((member) => member.userId === userId)?.role ?? null;
}

/**
 * Picks the organization to work in: the one chosen before if it still exists
 * and is not cancelled, otherwise the first active one, otherwise the first
 * that is not cancelled, otherwise the first. Null if there are none.
 */
export function chooseActiveOrganization(
  organizations: readonly OrganizationSummary[],
  preferredId: string | null,
): OrganizationSummary | null {
  if (organizations.length === 0) return null;
  const preferred = preferredId
    ? organizations.find((org) => org.id === preferredId)
    : undefined;
  if (preferred && preferred.status !== "cancelled") return preferred;
  return (
    organizations.find((org) => org.status === "active") ??
    organizations.find((org) => org.status !== "cancelled") ??
    organizations[0] ??
    null
  );
}

export type StatusAction = "ready" | "setup" | "blocked";

/** What the shell does for an organization in this status. */
export function statusAction(status: OrganizationStatus): StatusAction {
  switch (status) {
    case "active":
      return "ready";
    case "pending_setup":
      return "setup";
    case "suspended":
    case "cancelled":
      return "blocked";
  }
}
