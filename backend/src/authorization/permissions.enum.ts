/**
 * Every permission-gated action in TrustFlow. Deliberately modeled
 * as `resource:action` pairs (matching the CTO's examples) rather
 * than one enum per module — this is the single vocabulary every
 * future business module (Products, Orders, Finance, Inventory...)
 * extends, rather than each module inventing its own permission
 * naming convention.
 */
export enum Permission {
  // Organization
  ORGANIZATION_CREATE = 'organization:create',
  ORGANIZATION_UPDATE = 'organization:update',
  ORGANIZATION_DELETE = 'organization:delete',
  ORGANIZATION_VIEW = 'organization:view',

  // Membership
  MEMBER_INVITE = 'member:invite',
  MEMBER_REMOVE = 'member:remove',
  MEMBER_UPDATE = 'member:update',
  MEMBER_VIEW = 'member:view',
  OWNERSHIP_TRANSFER = 'ownership:transfer',

  // Placeholders for upcoming Sprint 4 business modules — declared
  // now so the permission vocabulary is stable and RBAC doesn't need
  // to be revisited when those modules land; unused until then.
  INVOICE_CREATE = 'invoice:create',
  INVOICE_APPROVE = 'invoice:approve',
  INVENTORY_UPDATE = 'inventory:update',

  // Customer (Sprint 4)
  CUSTOMER_CREATE = 'customer:create',
  CUSTOMER_READ = 'customer:read',
  CUSTOMER_UPDATE = 'customer:update',
  CUSTOMER_DELETE = 'customer:delete',
  CUSTOMER_NOTE_CREATE = 'customer_note:create',
  CUSTOMER_NOTE_READ = 'customer_note:read',
}
