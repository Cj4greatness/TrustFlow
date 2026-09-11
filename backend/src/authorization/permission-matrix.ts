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
    // CTO-RATIFIED (RBAC Ratification Decision Record): INVOICE_READ
    // is universal across all five roles.
    Permission.INVOICE_READ,
    Permission.INVOICE_UPDATE,
    Permission.INVOICE_ISSUE,
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
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
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE,
    Permission.ORDER_CONFIRM,
    Permission.ORDER_CANCEL,
    Permission.ORDER_PROCESS,
    Permission.ORDER_COMPLETE,
    Permission.RECEIPT_SETTINGS_READ,
    Permission.RECEIPT_SETTINGS_UPDATE,
    Permission.RECEIPT_READ,
    Permission.RECEIPT_VOID,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_ASSIGN,
    Permission.DELIVERY_TRANSITION,
    Permission.DELIVERY_CANCEL,
    // SUPPLIER_READ remains Owner-only — this predates and is
    // separate from the RBAC Ratification Decision Record, which
    // explicitly excluded it (still the S7-01 stopgap; revisit only
    // if that decision is separately reopened).
    Permission.SUPPLIER_READ,
    // CTO-RATIFIED: Supplier mutation matrix, modeled on Product's
    // Owner/Admin/Manager shape.
    Permission.SUPPLIER_CREATE,
    Permission.SUPPLIER_UPDATE,
    Permission.SUPPLIER_DELETE,
    Permission.SUPPLIER_PRODUCT_MANAGE,
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
    // CTO-RATIFIED: INVOICE_READ is universal across all five roles.
    Permission.INVOICE_READ,
    Permission.INVOICE_UPDATE,
    Permission.INVOICE_ISSUE,
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
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
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE,
    Permission.ORDER_CONFIRM,
    Permission.ORDER_CANCEL,
    Permission.ORDER_PROCESS,
    Permission.ORDER_COMPLETE,
    Permission.RECEIPT_SETTINGS_READ,
    Permission.RECEIPT_SETTINGS_UPDATE,
    Permission.RECEIPT_READ,
    Permission.RECEIPT_VOID,
    Permission.DELIVERY_READ,
    Permission.DELIVERY_ASSIGN,
    Permission.DELIVERY_TRANSITION,
    Permission.DELIVERY_CANCEL,
    // CTO-RATIFIED: Supplier mutation matrix. Note SUPPLIER_READ is
    // NOT included here — Admin has never had it (Owner-only S7-01
    // stopgap, untouched by this ratification).
    Permission.SUPPLIER_CREATE,
    Permission.SUPPLIER_UPDATE,
    Permission.SUPPLIER_DELETE,
    Permission.SUPPLIER_PRODUCT_MANAGE,
  ],
  [OrganizationRole.MANAGER]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // CTO-RATIFIED (RBAC Ratification Decision Record): Manager does
    // not receive MEMBER_INVITE or MEMBER_UPDATE — member governance
    // stays Owner/Admin-only, consistent with MEMBER_REMOVE.
    Permission.INVOICE_CREATE,
    // CTO-RATIFIED: INVOICE_READ is universal across all five roles.
    Permission.INVOICE_READ,
    Permission.INVOICE_UPDATE,
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
    Permission.INVENTORY_UPDATE,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    // CTO-RATIFIED: CUSTOMER_UPDATE granted to Manager, matching the
    // create+update-no-delete shape already used for Product/Order.
    Permission.CUSTOMER_UPDATE,
    // Deliberately no CUSTOMER_DELETE — per the locked Customer
    // permission matrix, only Owner/Admin can delete customers.
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_UPDATE,
    // Deliberately no PRODUCT_DELETE — same reasoning as
    // CUSTOMER_DELETE: only Owner/Admin can delete.
    Permission.INVENTORY_READ,
    Permission.INVENTORY_ADJUST,
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE,
    Permission.ORDER_CONFIRM,
    // Deliberately no ORDER_CANCEL — approved Orders RBAC matrix:
    // Manager gets all order permissions except cancellation.
    Permission.ORDER_PROCESS,
    Permission.ORDER_COMPLETE,
    Permission.RECEIPT_SETTINGS_READ,
    // Deliberately no RECEIPT_SETTINGS_UPDATE — Owner/Admin only.
    Permission.RECEIPT_READ,
    // Deliberately no RECEIPT_VOID — Owner/Admin only.
    Permission.DELIVERY_READ,
    Permission.DELIVERY_ASSIGN,
    Permission.DELIVERY_TRANSITION,
    // Deliberately no DELIVERY_CANCEL — Owner/Admin only, matching
    // INVOICE_APPROVE / RECEIPT_VOID's pattern.
    // CTO-RATIFIED: Supplier mutation matrix, modeled on Product's
    // Owner/Admin/Manager shape. No SUPPLIER_DELETE (Owner/Admin
    // only, matching Product/Customer's delete restriction) and no
    // SUPPLIER_READ (unchanged S7-01 stopgap, Owner-only).
    Permission.SUPPLIER_CREATE,
    Permission.SUPPLIER_UPDATE,
    Permission.SUPPLIER_PRODUCT_MANAGE,
  ],
  [OrganizationRole.STAFF]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Deliberately no MEMBER_INVITE — per CTO acceptance criteria,
    // "Staff cannot invite users."
    Permission.INVOICE_CREATE,
    // CTO-RATIFIED: INVOICE_READ is universal across all five roles.
    Permission.INVOICE_READ,
    Permission.PAYMENT_READ,
    Permission.CUSTOMER_CREATE,
    Permission.CUSTOMER_READ,
    // CTO-RATIFIED: Staff does NOT receive CUSTOMER_UPDATE — kept
    // excluded per the ratification decision (Manager+ only).
    // Deliberately no CUSTOMER_DELETE — same reasoning as Manager.
    Permission.CUSTOMER_NOTE_CREATE,
    Permission.CUSTOMER_NOTE_READ,
    Permission.PRODUCT_READ,
    // No PRODUCT_CREATE/UPDATE/DELETE for Staff — product
    // definition/pricing is treated as a Manager+ responsibility.
    Permission.INVENTORY_READ,
    // CTO-RATIFIED: INVENTORY_ADJUST granted to Staff — Staff already
    // performs ORDER_PROCESS, the operational step inventory
    // adjustment supports. Enforcement of inventory invariants
    // (append-only movement validation) remains in the domain
    // service — this permission authorizes the call, it does not
    // bypass stock/movement validation.
    Permission.INVENTORY_ADJUST,
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_PROCESS,
    // Approved Orders RBAC matrix: Staff can create orders and mark
    // them processed, but cannot update/confirm/cancel/complete.
    Permission.RECEIPT_SETTINGS_READ,
    Permission.RECEIPT_READ,
    Permission.DELIVERY_READ,
    // Deliberately no DELIVERY_ASSIGN/TRANSITION/CANCEL — Staff
    // excluded from all Delivery mutations (ratified this session).
    // No Supplier mutation permissions for Staff — read-only tier
    // per the ratified Supplier matrix (and SUPPLIER_READ itself
    // remains Owner-only per the unchanged S7-01 stopgap, so Staff
    // currently has no supplier access at all).
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
    Permission.ORDER_READ,
    Permission.INVOICE_READ,
    Permission.PAYMENT_READ,
    Permission.RECEIPT_SETTINGS_READ,
    Permission.RECEIPT_READ,
    Permission.DELIVERY_READ,
    // No Supplier permissions — SUPPLIER_READ remains Owner-only per
    // the unchanged S7-01 stopgap.
  ],
};
