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
  "overview" | "business" | "commerce" | "management" | "communication";

export type NavSection = {
  id: NavSectionId;
  label: string;
  items: readonly NavItem[];
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", ready: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [
      {
        id: "customers",
        label: "Customers",
        href: "/customers",
        permission: "customer:read",
        ready: false,
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
    id: "commerce",
    label: "Commerce",
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
    id: "management",
    label: "Management",
    items: [
      {
        id: "team",
        label: "Team",
        href: "/team",
        permission: "member:view",
        ready: false,
      },
      {
        id: "roles",
        label: "Roles",
        href: "/roles",
        permission: "member:view",
        ready: false,
      },
      {
        id: "settings",
        label: "Settings",
        href: "/settings",
        permission: "organization:view",
        ready: false,
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      {
        id: "communication-hub",
        label: "Communication Hub",
        href: "/communication",
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
