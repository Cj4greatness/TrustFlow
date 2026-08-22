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
    // DEFAULT APPLIED, NOT CTO-CONFIRMED (was flagged in the Sprint 5
    // review as unassigned everywhere including Owner; surfaced again
    // as an actual test-blocking bug while writing Receipts e2e
    // tests during Sprint 6). Reasoning: every role with
    // INVOICE_CREATE should be able to read what it creates;
    // INVOICE_UPDATE mirrors ORDER_UPDATE's existing Owner/Admin/
    // Manager pattern; INVOICE_ISSUE mirrors INVOICE_APPROVE
    // (senior-role, customer-facing action); PAYMENT_CREATE is
    // conservative Owner/Admin/Manager, same tier as
    // INVENTORY_ADJUST. Confirm with CTO and replace this comment
    // once ratified — do not treat as final.
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
    // DEFAULT APPLIED, NOT CTO-CONFIRMED — see OWNER block above for
    // full reasoning.
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
  ],
  [OrganizationRole.MANAGER]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Deliberately no MEMBER_REMOVE — per CTO acceptance criteria,
    // "Manager cannot remove owner" (and, more generally, Manager
    // has no member-removal rights at all in this matrix).
    Permission.INVOICE_CREATE,
    // DEFAULT APPLIED, NOT CTO-CONFIRMED — see OWNER block above for
    // full reasoning. No INVOICE_APPROVE/INVOICE_ISSUE for Manager
    // (Owner/Admin only, mirrors existing senior-action pattern).
    Permission.INVOICE_READ,
    Permission.INVOICE_UPDATE,
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
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
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_UPDATE,
    Permission.ORDER_CONFIRM,
    // Deliberately no ORDER_CANCEL — approved Orders RBAC matrix:
    // Manager gets all order permissions except cancellation.
    Permission.ORDER_PROCESS,
    Permission.ORDER_COMPLETE,
    Permission.RECEIPT_SETTINGS_READ,
    // Deliberately no RECEIPT_SETTINGS_UPDATE — Owner/Admin only,
    // matching ORGANIZATION_UPDATE's existing pattern.
    Permission.RECEIPT_READ,
    // Deliberately no RECEIPT_VOID — Owner/Admin only, matching
    // INVOICE_APPROVE / RECEIPT_SETTINGS_UPDATE's pattern.
  ],
  [OrganizationRole.STAFF]: [
    Permission.ORGANIZATION_VIEW,
    Permission.MEMBER_VIEW,
    // Deliberately no MEMBER_INVITE — per CTO acceptance criteria,
    // "Staff cannot invite users."
    Permission.INVOICE_CREATE,
    // DEFAULT APPLIED, NOT CTO-CONFIRMED — see OWNER block above.
    // Staff gets INVOICE_READ/PAYMENT_READ (can see what it creates)
    // but NOT INVOICE_UPDATE/PAYMENT_CREATE — conservative default,
    // mirrors Staff's existing exclusion from ORDER_UPDATE.
    Permission.INVOICE_READ,
    Permission.PAYMENT_READ,
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
    Permission.ORDER_CREATE,
    Permission.ORDER_READ,
    Permission.ORDER_PROCESS,
    // Approved Orders RBAC matrix: Staff can create orders and mark
    // them processed, but cannot update/confirm/cancel/complete.
    Permission.RECEIPT_SETTINGS_READ,
    Permission.RECEIPT_READ,
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
  ],
};
