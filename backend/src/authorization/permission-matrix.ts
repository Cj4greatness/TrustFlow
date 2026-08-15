import { Permission } from './permissions.enum';
import { OrganizationRole } from '../organization-members/entities/organization-member.entity';

/**
 * The authoritative mapping of what each role can do. This is the
 * single place permission grants are defined — AuthorizationService
 * consults this table, nothing else. Adding a new permission for a
 * future module means adding it here and to permissions.enum.ts,
 * not touching every controller that might care about it.
 */
export const PERMISSION_MATRIX: Record<OrganizationRole, Permission[]> = {
  [OrganizationRole.OWNER]: [
    Permission.ORGANIZATION_CREATE,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_DELETE,
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE,
    Permission.MEMBER_VIEW,
    Permission.OWNERSHIP_TRANSFER,
    Permission.INVOICE_CREATE,
    Permission.INVOICE_APPROVE,
    Permission.INVENTORY_UPDATE,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_UPDATE,
    Permission.CUSTOMER_DELETE,
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_UPDATE,
    Permission.PRODUCT_DELETE,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_ADJUST,
  ],
  [OrganizationRole.ADMIN]: [
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE,
    Permission.MEMBER_VIEW,
    // Deliberately no OWNERSHIP_TRANSFER or ORGANIZATION_DELETE —
    // per CTO acceptance criteria, "Admin cannot transfer
    // ownership."
    Permission.INVOICE_CREATE,
    Permission.INVOICE_APPROVE,
    Permission.INVENTORY_UPDATE,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_UPDATE,
    Permission.CUSTOMER_DELETE,
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_UPDATE,
    Permission.PRODUCT_DELETE,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_ADJUST,
  ],
  [OrganizationRole.MANAGER]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Deliberately no MEMBER_REMOVE — per CTO acceptance criteria,
    // "Manager cannot remove owner" (and, more generally, Manager
    // has no member-removal rights at all in this matrix).
    Permission.INVOICE_CREATE,
    Permission.INVENTORY_UPDATE,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    // FLAGGED FOR CTO REVIEW: no CUSTOMER_UPDATE for Manager or Staff
    // (see STAFF block below). Unlike CUSTOMER_DELETE, this wasn't a
    // deliberate exclusion from the CTO's acceptance criteria — it's
    // simply absent. As written, Manager/Staff can create a customer
    // but cannot edit it, fix a typo, or manage its addresses (address
    // mutations are gated on CUSTOMER_UPDATE too). Confirm whether
    // this is intended before Product & Inventory's matrix is built
    // against the same pattern.
    // Deliberately no CUSTOMER_DELETE — per the locked Customer
    // permission matrix, only Owner/Admin can delete customers.
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_UPDATE,
    // Deliberately no PRODUCT_DELETE — same reasoning as
    // CUSTOMER_DELETE: only Owner/Admin can delete. Unlike the
    // Customer matrix, PRODUCT_UPDATE IS included here deliberately
    // — the CUSTOMER_UPDATE gap for Manager was flagged as likely
    // unintentional, so it isn't repeated here without a reason.
    Permission.INVENTORY_READ,
    Permission.INVENTORY_ADJUST,
  ],
  [OrganizationRole.STAFF]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Deliberately no MEMBER_INVITE — per CTO acceptance criteria,
    // "Staff cannot invite users."
    Permission.INVOICE_CREATE,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    // See the flagged note in MANAGER above — same gap applies here.
    // Deliberately no CUSTOMER_DELETE — same reasoning as Manager.
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_READ,
    // No PRODUCT_CREATE/UPDATE/DELETE for Staff — product
    // definition/pricing is treated as a Manager+ responsibility.
    Permission.INVENTORY_READ,
    // FLAGGED FOR CTO REVIEW: INVENTORY_ADJUST for Staff.
    // The directive does not explicitly establish whether Staff may
    // adjust inventory. Do not infer this from PRODUCT_UPDATE being
    // withheld above — they're independent decisions. Inventory
    // adjustments change stock state and create audit records, so
    // this needs an explicit business-policy decision, not an
    // implementation default. Withheld (not granted) until decided,
    // matching the safer-default precedent set by the unresolved
    // CUSTOMER_UPDATE gap for Manager/Staff.
    // INVENTORY_ADJUST intentionally NOT included here.
  ],
  [OrganizationRole.VIEWER]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Per CTO acceptance criteria, "Viewer is read-only" — no
    // mutating permissions of any kind.
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_READ,
    Permission.INVENTORY_READ,
  ],
};
