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
  /** False until the page exists, so the sidebar never links to a 404. */
  ready: boolean;
};

export type NavSection = {
  id: "main" | "settings";
  label: string | null;
  items: readonly NavItem[];
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "main",
    label: null,
    items: [
      { id: "dashboard", label: "Dashboard", href: "/dashboard", ready: true },
      {
        id: "orders",
        label: "Orders",
        href: "/orders",
        permission: "order:read",
        ready: false,
      },
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
        id: "suppliers",
        label: "Suppliers",
        href: "/suppliers",
        permission: "supplier:read",
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
    id: "settings",
    label: "Settings",
    items: [
      {
        id: "team",
        label: "Team",
        href: "/team",
        permission: "member:view",
        ready: false,
      },
      {
        id: "organization",
        label: "Organization",
        href: "/organization",
        permission: "organization:view",
        ready: false,
      },
      {
        id: "receipt-settings",
        label: "Receipt settings",
        href: "/receipt-settings",
        permission: "receipt_settings:read",
        ready: false,
      },
    ],
  },
];

/**
 * The sections a person with this role should see. An unknown or missing role
 * sees nothing. Pages that are not built yet are left out unless asked for.
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
