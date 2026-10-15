// Mirrors backend/src/authorization/permissions.enum.ts and
// permission-matrix.ts (develop 11158814). The backend is the authority:
// this file only decides what the UI shows. When the backend matrix changes,
// this is the one place to update.

export const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "organization:create",
  "organization:update",
  "organization:delete",
  "organization:view",
  "member:invite",
  "member:remove",
  "member:update",
  "member:view",
  "ownership:transfer",
  "invoice:create",
  "invoice:approve",
  "invoice:read",
  "invoice:update",
  "invoice:issue",
  "payment:create",
  "payment:read",
  "inventory:update",
  "customer:create",
  "customer:read",
  "customer:update",
  "customer:delete",
  "customer_note:create",
  "customer_note:read",
  "product:create",
  "product:read",
  "product:update",
  "product:delete",
  "inventory:read",
  "inventory:adjust",
  "supplier:create",
  "supplier:read",
  "supplier:update",
  "supplier:delete",
  "supplier_product:manage",
  "order:create",
  "order:read",
  "order:update",
  "order:confirm",
  "order:cancel",
  "order:process",
  "order:complete",
  "receipt_settings:read",
  "receipt_settings:update",
  "receipt:create",
  "receipt:read",
  "receipt:void",
  "receipt:regenerate",
  "delivery:create",
  "delivery:read",
  "delivery:assign",
  "delivery:transition",
  "delivery:cancel",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Granted to no role: the backend performs these itself.
const SYSTEM_ONLY: readonly Permission[] = [
  "receipt:create",
  "delivery:create",
];

const ADMIN: readonly Permission[] = [
  "organization:update",
  "organization:view",
  "member:invite",
  "member:remove",
  "member:update",
  "member:view",
  "invoice:create",
  "invoice:approve",
  "invoice:read",
  "invoice:update",
  "invoice:issue",
  "payment:create",
  "payment:read",
  "inventory:update",
  "customer:create",
  "customer:read",
  "customer:update",
  "customer:delete",
  "customer_note:create",
  "customer_note:read",
  "product:create",
  "product:read",
  "product:update",
  "product:delete",
  "inventory:read",
  "inventory:adjust",
  "order:create",
  "order:read",
  "order:update",
  "order:confirm",
  "order:cancel",
  "order:process",
  "order:complete",
  "receipt_settings:read",
  "receipt_settings:update",
  "receipt:read",
  "receipt:void",
  "delivery:read",
  "delivery:assign",
  "delivery:transition",
  "delivery:cancel",
  "supplier:create",
  "supplier:update",
  "supplier:delete",
  "supplier_product:manage",
];

const MANAGER: readonly Permission[] = [
  "organization:view",
  "member:view",
  "invoice:create",
  "invoice:read",
  "invoice:update",
  "payment:create",
  "payment:read",
  "inventory:update",
  "customer:create",
  "customer:read",
  "customer:update",
  "customer_note:create",
  "customer_note:read",
  "product:create",
  "product:read",
  "product:update",
  "inventory:read",
  "inventory:adjust",
  "order:create",
  "order:read",
  "order:update",
  "order:confirm",
  "order:process",
  "order:complete",
  "receipt_settings:read",
  "receipt:read",
  "delivery:read",
  "delivery:assign",
  "delivery:transition",
  "supplier:create",
  "supplier:update",
  "supplier_product:manage",
];

const STAFF: readonly Permission[] = [
  "organization:view",
  "member:view",
  "invoice:create",
  "invoice:read",
  "payment:read",
  "customer:create",
  "customer:read",
  "customer_note:create",
  "customer_note:read",
  "product:read",
  "inventory:read",
  "inventory:adjust",
  "order:create",
  "order:read",
  "order:process",
  "receipt_settings:read",
  "receipt:read",
  "delivery:read",
];

const VIEWER: readonly Permission[] = [
  "organization:view",
  "member:view",
  "customer:read",
  "customer_note:read",
  "product:read",
  "inventory:read",
  "order:read",
  "invoice:read",
  "payment:read",
  "receipt_settings:read",
  "receipt:read",
  "delivery:read",
];

// Owner holds every permission except the system-only ones above.
const OWNER: readonly Permission[] = PERMISSIONS.filter(
  (p) => !SYSTEM_ONLY.includes(p),
);

export const PERMISSION_MATRIX: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  manager: MANAGER,
  staff: STAFF,
  viewer: VIEWER,
};

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

// The one question the UI asks. An unknown or missing role can do nothing.
export function can(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  if (!isRole(role)) return false;
  return PERMISSION_MATRIX[role].includes(permission);
}
