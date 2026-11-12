"use client";

import { useOrg } from "@/components/app/org-provider";
import type { OrganizationSummary } from "@/lib/app/org-context";

/** Organizations a person can switch to. Cancelled ones are left out, because the app would not open them anyway. */
function selectable(organizations: readonly OrganizationSummary[]) {
  return organizations.filter(
    (organization) => organization.status !== "cancelled",
  );
}

/** True when there is more than one organization to choose between. */
export function hasOrganizationChoice(
  organizations: readonly OrganizationSummary[],
): boolean {
  return selectable(organizations).length >= 2;
}

/**
 * Lets a person who belongs to more than one organization switch between
 * them. Hidden for everyone else. A native select is accessible and works well
 * on phones. Switching reloads the organization and role, and until that
 * finishes the app shows nothing, so nothing from the previous organization
 * can stay on screen.
 */
export function OrgSwitcher() {
  const { state, selectOrganization } = useOrg();
  if (state.status !== "ready") return null;
  if (!hasOrganizationChoice(state.organizations)) return null;

  return (
    <div>
      <label htmlFor="organization-switcher" className="sr-only">
        Organization
      </label>
      <select
        id="organization-switcher"
        value={state.organization.id}
        onChange={(event) => selectOrganization(event.target.value)}
        className="h-9 max-w-[14rem] truncate rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {selectable(state.organizations).map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </div>
  );
}
