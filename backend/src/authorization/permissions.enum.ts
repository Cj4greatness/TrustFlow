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
  INVOICE_READ = 'invoice:read',
  INVOICE_UPDATE = 'invoice:update',
  INVOICE_ISSUE = 'invoice:issue',
  PAYMENT_CREATE = 'payment:create',
  PAYMENT_READ = 'payment:read',
  INVENTORY_UPDATE = 'inventory:update',
  // Customer (Sprint 4)
  CUSTOMER_CREATE = 'customer:create',
  CUSTOMER_READ = 'customer:read',
  CUSTOMER_UPDATE = 'customer:update',
  CUSTOMER_DELETE = 'customer:delete',
  CUSTOMER_NOTE_CREATE = 'customer_note:create',
  CUSTOMER_NOTE_READ = 'customer_note:read',
  // Product & Inventory (Sprint 4, CTO Directive v1)
  PRODUCT_CREATE = 'product:create',
  PRODUCT_READ = 'product:read',
  PRODUCT_UPDATE = 'product:update',
  PRODUCT_DELETE = 'product:delete',
  INVENTORY_READ = 'inventory:read',
  INVENTORY_ADJUST = 'inventory:adjust',
  // Suppliers (Sprint 4, Suppliers Directive v1)
  SUPPLIER_CREATE = 'supplier:create',
  SUPPLIER_READ = 'supplier:read',
  SUPPLIER_UPDATE = 'supplier:update',
  SUPPLIER_DELETE = 'supplier:delete',
  SUPPLIER_PRODUCT_MANAGE = 'supplier_product:manage',
  // Orders (Sprint 4, Orders Directive v1)
  ORDER_CREATE = 'order:create',
  ORDER_READ = 'order:read',
  ORDER_UPDATE = 'order:update',
  ORDER_CONFIRM = 'order:confirm',
  ORDER_CANCEL = 'order:cancel',
  ORDER_PROCESS = 'order:process',
  ORDER_COMPLETE = 'order:complete',
  // Receipt Settings (Sprint 6 CTO Directive §14)
  RECEIPT_SETTINGS_READ = 'receipt_settings:read',
  RECEIPT_SETTINGS_UPDATE = 'receipt_settings:update',
  // Receipts (Sprint 6 CTO Directive §21-22)
  RECEIPT_CREATE = 'receipt:create',
  RECEIPT_READ = 'receipt:read',
  RECEIPT_VOID = 'receipt:void',
  // Delivery (Sprint 6 CTO Directive §23-28)
  DELIVERY_CREATE = 'delivery:create',
  DELIVERY_READ = 'delivery:read',
  DELIVERY_ASSIGN = 'delivery:assign',
  DELIVERY_TRANSITION = 'delivery:transition',
  DELIVERY_CANCEL = 'delivery:cancel',
}
