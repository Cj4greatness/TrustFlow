// Sidebar structure and the rules for who sees what. Pure, so it can be tested
// without a browser. The backend enforces permissions; this only decides what
// is worth showing.

import { can, isRole, type Permission } from "../auth/permissions";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  /** Permission needed to see the item. Absent means every member sees it. */
  permission?: Permission;
  /** False until the page exists: shown as a disabled "Soon" entry, no link. */
  ready: boolean;
};

export type NavSectionId =
  | "overview"
  | "business-operations"
  | "commerce-finance"
  | "growth-engagement"
  | "intelligence"
  | "administration";

export type NavSection = {
  id: NavSectionId;
  label: string;
  items: readonly NavItem[];
};

// Grouping and names follow the approved TrustFlow v1 design reference.
// Growth and Intelligence items have no backend permission yet, so every
// member sees them as planned entries. Audit Logs is limited to roles that
// can update the organization until the backend defines an audit permission.
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", ready: true },
    ],
  },
  {
    id: "business-operations",
    label: "Business Operations",
    items: [
      {
        id: "customers",
        label: "Customers",
        href: "/customers",
        permission: "customer:read",
        ready: true,
      },
      {
        id: "products",
        label: "Products",
        href: "/products",
        permission: "product:read",
        ready: false,
      },
      {
        id: "inventory",
        label: "Inventory",
        href: "/inventory",
        permission: "inventory:read",
        ready: false,
      },
      {
        id: "suppliers",
        label: "Suppliers",
        href: "/suppliers",
        permission: "supplier:read",
        ready: false,
      },
    ],
  },
  {
    id: "commerce-finance",
    label: "Commerce & Finance",
    items: [
      {
        id: "orders",
        label: "Orders",
        href: "/orders",
        permission: "order:read",
        ready: false,
      },
      {
        id: "payments",
        label: "Payments",
        href: "/payments",
        permission: "payment:read",
        ready: false,
      },
      {
        id: "invoices",
        label: "Invoices",
        href: "/invoices",
        permission: "invoice:read",
        ready: false,
      },
      {
        id: "receipts",
        label: "Receipts",
        href: "/receipts",
        permission: "receipt:read",
        ready: false,
      },
      {
        id: "deliveries",
        label: "Deliveries",
        href: "/deliveries",
        permission: "delivery:read",
        ready: false,
      },
    ],
  },
  {
    id: "growth-engagement",
    label: "Growth & Engagement",
    items: [
      {
        id: "marketing",
        label: "Marketing",
        href: "/marketing",
        ready: false,
      },
      {
        id: "communication-hub",
        label: "Communication Hub",
        href: "/communication",
        ready: false,
      },
      { id: "crm", label: "CRM", href: "/crm", ready: false },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    items: [
      {
        id: "ai-assistant",
        label: "AI Assistant",
        href: "/ai-assistant",
        ready: false,
      },
      {
        id: "business-insights",
        label: "Business Insights",
        href: "/insights",
        ready: false,
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        id: "team",
        label: "Team & Permissions",
        href: "/team",
        permission: "member:view",
        ready: false,
      },
      {
        id: "settings",
        label: "Organization Settings",
        href: "/settings",
        permission: "organization:view",
        ready: false,
      },
      {
        id: "audit-logs",
        label: "Audit Logs",
        href: "/audit-logs",
        permission: "organization:update",
        ready: false,
      },
    ],
  },
];

/**
 * The sections a person with this role should see. An unknown or missing role
 * sees nothing. Pages that are not built yet are left out unless asked for
 * (the shell asks for them and shows them as disabled "Soon" entries).
 */
export function visibleNavigation(
  role: string | null | undefined,
  options: { includePlanned?: boolean } = {},
): NavSection[] {
  if (!isRole(role)) return [];
  const includePlanned = options.includePlanned ?? false;
  const sections: NavSection[] = [];
  for (const section of NAV_SECTIONS) {
    const items = section.items.filter(
      (item) =>
        (includePlanned || item.ready) &&
        (item.permission === undefined || can(role, item.permission)),
    );
    if (items.length > 0) sections.push({ ...section, items });
  }
  return sections;
}

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumbs for a path, built from the same sections as the sidebar so the
 * two cannot drift apart. Unknown paths get only the root crumb.
 */
export function breadcrumbsFor(
  pathname: string,
  currentLabel?: string,
): Crumb[] {
  const root: Crumb = { label: "TrustFlow", href: "/dashboard" };
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href) return [root, { label: item.label }];
      if (pathname.startsWith(`${item.href}/`)) {
        return currentLabel
          ? [
              root,
              { label: item.label, href: item.href },
              { label: currentLabel },
            ]
          : [root, { label: item.label }];
      }
    }
  }
  return [root];
}
