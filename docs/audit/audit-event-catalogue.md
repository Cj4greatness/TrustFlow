# AUD-02: Audit Event Catalogue and Priorities

**Status:** preparation proposal; no application, schema, or test changes are included in this document-only task.

## What was verified

The current `AuditLog` entity is in [audit-log.entity.ts:11](../../backend/src/audit/entities/audit-log.entity.ts#L11); the initial PostgreSQL schema is in [Sprint3IdentityFoundation.ts:29](../../backend/src/database/migrations/1784800419184-Sprint3IdentityFoundation.ts#L29). The existing action values are:

| Existing `audit_logs.action` value | Declared in code | Application writer found |
|---|---|---|
| `user.login` | `AuditAction.USER_LOGIN` | No |
| `user.logout` | `AuditAction.USER_LOGOUT` | No |
| `user.registered` | `AuditAction.USER_REGISTERED` | No |
| `organization.created` | `AuditAction.ORGANIZATION_CREATED` | No |
| `role.changed` | `AuditAction.ROLE_CHANGED` | No |
| `password.reset` | `AuditAction.PASSWORD_RESET` | No |
| `invitation.sent` | `AuditAction.INVITATION_SENT` | No |
| `invitation.accepted` | `AuditAction.INVITATION_ACCEPTED` | No |

These are also the complete values in the initial enum declaration. A repository-wide search found no `AuditLog` save/insert call, no audit-row update/delete call, and no separate audit writer; [audit.module.ts:3](../../backend/src/audit/audit.module.ts#L3) only registers the entity with TypeORM. Thus "already audited" below means a value may already exist in the enum, but **no event is persistently written today**.

### Current table shape and constraints

| Column / property | Current definition | Nullable? |
|---|---|---|
| `id` | Generated UUID primary key | No |
| `user_id` / `userId` (proposed actor) | UUID, relation to `users`; FK uses `ON DELETE SET NULL` | Yes |
| `organization_id` / `organizationId` | UUID, relation to `organizations`; FK uses `ON DELETE SET NULL` | Yes |
| `action` | `audit_logs_action_enum` | No |
| `ip_address` / `ipAddress` | `varchar(45)` | Yes |
| `user_agent` / `userAgent` | `varchar(500)` | Yes |
| `metadata` | `jsonb` | Yes |
| `created_at` / `createdAt` | `timestamptz` | No |
| Target type / target ID | No dedicated columns | N/A; proposed as allowlisted metadata keys |

The table has indexes on `action`, `organization_id`, and `user_id`, but no declared target or timestamp index. `created_at` has no database default in the initial table definition. The actor/organization nullability and delete behavior are visible in [audit-log.entity.ts:40](../../backend/src/audit/entities/audit-log.entity.ts#L40) and [Sprint3IdentityFoundation.ts:32](../../backend/src/database/migrations/1784800419184-Sprint3IdentityFoundation.ts#L32); the two `SET NULL` foreign keys are at [Sprint3IdentityFoundation.ts:53](../../backend/src/database/migrations/1784800419184-Sprint3IdentityFoundation.ts#L53) and [Sprint3IdentityFoundation.ts:56](../../backend/src/database/migrations/1784800419184-Sprint3IdentityFoundation.ts#L56).

## Catalogue conventions

- **Actor:** authenticated user ID goes in `audit_logs.user_id`; `NULL` is appropriate when a failed authentication cannot establish a trusted identity. For system-triggered receipt generation, use the payment's `confirmedBy` user as the actor and identify the system trigger in metadata.
- **Target:** `metadata.targetType` and `metadata.targetId` are the proposed canonical target identifiers because the table has no target columns. IDs only; do not copy entity objects into metadata.
- **Organization:** populate `organization_id` for tenant-scoped events. It may be `NULL` only for genuinely pre-organization/global events (for example registration or an unknown-account login attempt).
- **Metadata allowlist:** action-specific keys below plus `targetType` and `targetId`; use stable reason codes, IDs, field-name lists, old/new enum states, and necessary financial amounts/currency. Do not put arbitrary request bodies into JSON.
- **Never record:** access/refresh/invitation tokens, passwords, password or token hashes, secrets/API keys, raw credential inputs, idempotency keys, raw invitation emails, or full PII (names, emails, phone numbers, addresses, free-form notes/reasons). For PII edits, log IDs and `changedFields`, not the values. For monetary values, use integer minor units (kobo for NGN) and currency, not floating-point numbers.
- IP and user agent are dedicated nullable columns, not metadata. Populate only where justified (principally authentication/security), apply an explicit retention policy, and never place credentials in either field.
- All listed rows are proposals unless a row explicitly identifies a current service method. `Yes` in the transaction column means the audit insert should commit/rollback with the state mutation; `No` identifies an intentional boundary or an absent feature.

## Security events

| Event | Actor | Target | Metadata keys (in addition to target keys) | Transactional? | Code location | Audited today? | Priority |
|---|---|---|---|---|---|---|---|
| `user.registered` (existing enum) | New user | User | `registrationMethod` | Yes; account creation and initial session state must not commit without the audit row | `register` [auth.service.ts:91](../../backend/src/auth/auth.service.ts#L91) | No; enum only | **P1** - important account lifecycle record; creation is already represented by `organization.created` only after a tenant is created |
| `user.login` (existing enum) | Authenticated user | User/session | `sessionStartedAt` or a non-secret session identifier | Yes; pair the audit row with last-login/session-token-hash persistence | `login` [auth.service.ts:127](../../backend/src/auth/auth.service.ts#L127) | No; enum only | **P0** - attributable successful access and session creation |
| `user.login_failed` (new) | `NULL` (untrusted attempt) | Known user ID if resolved, otherwise no target | `reasonCode` (`invalid_credentials`); no submitted email | No business mutation; persist the failure event before returning the auth error | `login` [auth.service.ts:127](../../backend/src/auth/auth.service.ts#L127) | No | **P0** - material security signal for credential attacks; rate-limit/monitor write volume |
| `user.access_denied` (new) | `NULL` unless identity is verified | Inactive user/account | `reasonCode` (`account_not_active`), `endpointClass` | No business mutation; insert before rejecting. Avoid an event for every repeated rejected JWT request unless throttled | `login` / `refresh` [auth.service.ts:127](../../backend/src/auth/auth.service.ts#L127), [auth.service.ts:173](../../backend/src/auth/auth.service.ts#L173), and JWT account-status gate [jwt.strategy.ts:38](../../backend/src/auth/strategies/jwt.strategy.ts#L38) | No; rejection currently throws; no persistent writer | **P1** - records access-control denial for known inactive accounts, with volume guard |
| `user.logout` (existing enum) | Authenticated user | User/session | `reasonCode` (`user_logout`) | Yes; revoke refresh-token hash and insert atomically | `logout` [auth.service.ts:288](../../backend/src/auth/auth.service.ts#L288) | No; enum only | **P0** - records explicit session termination |
| `user.session_rotated` (new) | Authenticated user | User/session | `reasonCode` (`refresh_rotation`) | Yes; same transaction as refresh-token-hash compare-and-swap | `refresh` [auth.service.ts:173](../../backend/src/auth/auth.service.ts#L173) | No; rotation currently persists only the hash | **P1** - detects session churn/replay context; assess volume and retain only security-relevant rotation records |
| `user.session_revoked` (new) | Authenticated user, or the actor causing the revocation | User/session | `reasonCode` (`expired`, `token_reuse`, `new_login`, `account_deleted`) | Yes; same transaction as clearing/replacing the refresh-token state | Expiry [auth.service.ts:59](../../backend/src/auth/auth.service.ts#L59), reuse/revocation helper [auth.service.ts:307](../../backend/src/auth/auth.service.ts#L307), account removal [users.service.ts:93](../../backend/src/users/users.service.ts#L93) | No; refresh failure is logger-only and session hash is cleared without audit | **P0** - security-sensitive invalidation and suspected refresh-token reuse |
| `password.reset` (existing enum) | Authenticated user or verified reset workflow | User | `resetMethod`, `reasonCode`; no reset token or credential data | Yes; same transaction as credential update and session invalidation | **No reset service/route found**; security module only mentions a possible future admin tool [security.module.ts:8](../../backend/src/security/security.module.ts#L8) | No; enum only; feature not found | **P1** - required when password-reset capability is implemented; no current call site |
| `user.deleted` (new) | The user (current endpoint is self-only) | User | `reasonCode` (`self_service`), membership IDs/count if needed | Yes; same transaction as refresh-token clearing, membership soft-deletion, and user soft-deletion | [UsersController.remove](../../backend/src/users/users.controller.ts#L82), [UsersService.softDelete](../../backend/src/users/users.service.ts#L93) | No | **P0** - account removal and access revocation must be attributable |

Current refresh expiry clears the stored token and throws at `rejectExpiredSession`; refresh-failure diagnostics are JSON sent to the Nest logger in `logRefreshFailure`, not persisted audit rows ([auth.service.ts:370](../../backend/src/auth/auth.service.ts#L370)). No password-reset workflow was found. The failed-login proposal intentionally stores no raw email or password; unknown and known-account failures must not enable account enumeration through the audit read API.

## Access-control events

| Event | Actor | Target | Metadata keys (in addition to target keys) | Transactional? | Code location | Audited today? | Priority |
|---|---|---|---|---|---|---|---|
| `organization.created` (existing enum) | Creator | Organization | `slug`, `initialOwnerMembershipId` | Yes; same transaction as organization and initial owner membership | `createWithOwner` [organizations.service.ts:36](../../backend/src/organizations/organizations.service.ts#L36) | No; enum only | **P0** - tenant boundary and initial ownership are security-critical |
| `organization.updated` (new) | Authenticated updater (must be threaded into the service) | Organization | `changedFields` only; no old/new PII values | Yes; same transaction as organization update | `update` [organizations.service.ts:105](../../backend/src/organizations/organizations.service.ts#L105) | No | **P1** - material tenant configuration changes |
| `organization.deactivated` (new; proposed future event) | Authorized Owner/Admin | Organization | `previousStatus`, `newStatus`, `reasonCode` | Yes, if a deactivation state transition is implemented | No deactivation service found; current status enum is [organization.entity.ts:4](../../backend/src/organizations/entities/organization.entity.ts#L4) | No; no deactivation method | **P1** - tenant disablement affects all access; no current call site |
| `organization.member_added` (new) | Accepting user | Membership | `memberUserId`, `role`, `source` (`invitation`), `invitationId` | Yes; same transaction as membership insert and invitation status update | [accept](../../backend/src/organization-members/invitations.service.ts#L141) | No | **P0** - material change to tenant access; initial owner membership is covered by `organization.created` |
| `organization.member_removed` (new) | Authenticated remover, self for leave, or deleting user for account removal | Membership | `memberUserId`, `previousRole`, `reasonCode` (`removed`, `left`, `user_deleted`) | Yes; same transaction as membership deletion/soft-deletion | Remove [organization-members.service.ts:50](../../backend/src/organization-members/organization-members.service.ts#L50), leave [organization-members.service.ts:226](../../backend/src/organization-members/organization-members.service.ts#L226), user deletion [users.service.ts:93](../../backend/src/users/users.service.ts#L93) | No | **P0** - revokes organization access and membership rows are currently deleted |
| `role.changed` (existing enum) | Authenticated administrator | Membership | `memberUserId`, `previousRole`, `newRole` | Yes; same transaction as role update | [updateMemberRole](../../backend/src/organization-members/organization-members.service.ts#L106) | No; enum only | **P0** - direct privilege change; especially Owner/Admin grants |
| `organization.ownership_transferred` (new) | Current Owner (must be threaded from controller) | Organization / old and new memberships | `previousOwnerUserId`, `newOwnerUserId`, `previousOwnerMembershipId`, `newOwnerMembershipId` | Yes; one row with both role writes in the same transaction | [transferOwnership](../../backend/src/organization-members/organization-members.service.ts#L179); controller currently does not pass actor [organization-members.controller.ts:96](../../backend/src/organization-members/organization-members.controller.ts#L96) | No | **P0** - atomic change of the tenant's highest privilege |
| `invitation.sent` (existing enum) | Inviter | Invitation | `invitationId`, `invitedRole`, `channel`, `expiresAt`; no email/token | Yes for invitation record plus audit; use a transactional outbox if email delivery must be guaranteed | `invite` [invitations.service.ts:39](../../backend/src/organization-members/invitations.service.ts#L39) | No; enum only; email sent after invitation transaction | **P1** - records an access offer; distinguish created/queued from confirmed email delivery |
| `invitation.accepted` (existing enum) | Accepting user | Invitation | `invitationId`, `membershipId`, `grantedRole` | Yes; same transaction as membership creation and invitation status update | [accept](../../backend/src/organization-members/invitations.service.ts#L141) | No; enum only | **P1** - existing `organization.member_added` P0 event records the actual access grant |
| `invitation.revoked` (new; includes recipient rejection) | Organization member revoking, or invited user rejecting | Invitation | `reasonCode` (`revoked`, `declined`), `previousStatus` | Yes; same transaction as status update | Recipient reject [invitations.service.ts:207](../../backend/src/organization-members/invitations.service.ts#L207), organization revoke [invitations.service.ts:226](../../backend/src/organization-members/invitations.service.ts#L226) | No | **P1** - preserves changes to pending access grants; revoke handler must receive actor ID |
| `invitation.expired` (proposed) | System | Invitation | `previousStatus`, `expiresAt` | Yes; same transaction as transition to expired | `validateToken` [invitations.service.ts:108](../../backend/src/organization-members/invitations.service.ts#L108) | No | **P2** - useful lifecycle history, but expiration is currently recorded only when a token is validated |
| Permission-matrix change | Not an application actor; deployment/change author | Permission definition/version | No runtime metadata | No runtime audit event; review/version-control the static permission change | Static mapping [permission-matrix.ts:1](../../backend/src/authorization/permission-matrix.ts#L1); enum [permissions.enum.ts:9](../../backend/src/authorization/permissions.enum.ts#L9) | N/A; no runtime matrix editor found | **P2** - permissions are code-defined, not user-mutated |

`invitation.sent` currently saves the invitation in a transaction and sends email afterward; do not store the invitation token in the audit row. The proposed `organization.ownership_transferred` should represent the paired demotion/promotion once, rather than producing two misleading one-sided role-change records. The recipient reject flow currently stores `REVOKED`, so the stable action can be `invitation.revoked` with a safe reason code.

## Financial events

| Event | Actor | Target | Metadata keys (in addition to target keys) | Transactional? | Code location | Audited today? | Priority |
|---|---|---|---|---|---|---|---|
| `invoice.created` (new) | `createdByUserId` | Invoice | `orderId`, `customerId`, `invoiceNumber`, `totalMinor`, `currency`, `lineItemCount` | Yes; same transaction as invoice and line-item inserts (currently part of order confirmation) | [createInvoiceForOrder](../../backend/src/invoices/invoices.service.ts#L38), called by [confirmOrder](../../backend/src/orders/orders.service.ts#L464) | No | **P1** - establishes a financial document; transactionally follows order confirmation |
| `invoice.updated` (new) | Authenticated updater (currently not passed to service) | Invoice | `changedFields`, `dueDate` if changed; never notes text | Yes; same transaction as update | [updateInvoice](../../backend/src/invoices/invoices.service.ts#L124) | No | **P1** - due-date/document changes affect collection and financial operations |
| `invoice.status_changed` (new) | Authenticated approver/issuer; payment actor for payment-driven transitions | Invoice | `previousStatus`, `newStatus`, `transitionSource`, `paymentId` if payment-driven | Yes; same transaction as invoice status write; payment-driven transition shares payment transaction | Approve [invoices.service.ts:150](../../backend/src/invoices/invoices.service.ts#L150), issue [invoices.service.ts:166](../../backend/src/invoices/invoices.service.ts#L166), payment application [invoices.service.ts:195](../../backend/src/invoices/invoices.service.ts#L195) | No | **P0** - captures approval, issuance, partial settlement, and paid state |
| `payment.recorded` (new) | `userId` confirming payment | Payment | `paymentId`, `invoiceId`, `amountMinor`, `currency`, `method`, `confirmedAt`; omit provider reference and idempotency key | Yes; same transaction as payment insert and invoice balance/status update | [recordPayment](../../backend/src/payments/payments.service.ts#L59) | No | **P0** - records money received and its invoice allocation as one committed fact |
| `receipt.issued` (new) | Payment's `confirmedBy`; system source in metadata | Receipt | `receiptId`, `paymentId`, `invoiceId`, `receiptNumber`, `amountMinor`, `currency`, `source` | Yes for receipt insert and audit row; **not** atomic with payment transaction under current event-listener design | Listener [receipts.service.ts:55](../../backend/src/receipts/receipts.service.ts#L55), receipt insert [receipts.service.ts:75](../../backend/src/receipts/receipts.service.ts#L75) | No | **P1** - durable proof of payment; async failure gap needs an outbox/retry decision |
| `receipt.regenerated` (new) | Authenticated user requesting regeneration (must be passed to service) | Newly created Receipt | `receiptId`, `paymentId`, `invoiceId`, `receiptNumber`, `amountMinor`, `currency` | Yes with newly inserted receipt; do not emit if the idempotent call returns an existing receipt | [regenerateReceipt](../../backend/src/receipts/receipts.service.ts#L178) | No | **P1** - records a repair/re-issue operation and its actor |
| `receipt.voided` (new) | Authenticated user (must be passed to service) | Receipt | `previousStatus`, `newStatus`, `reasonCode` | Yes; same transaction as status change | [voidReceipt](../../backend/src/receipts/receipts.service.ts#L162) | No | **P1** - preserves changes to issued proof of payment |
| `receipt.reconciled` (proposed; no current action) | Reconciler, if introduced | Receipt/payment | `receiptId`, `paymentId`, `outcomeCode`, `amountMinor`, `currency`; no raw bank statement details | Yes, if/when a reconciliation state mutation exists | No reconciliation method found; receipt write paths are [receipts.service.ts:55](../../backend/src/receipts/receipts.service.ts#L55) and [receipts.service.ts:178](../../backend/src/receipts/receipts.service.ts#L178) | No; no method | **P2** - no reconciliation behavior exists to audit yet |
| `discount.rejected` (proposed; no current action) | Requesting user or system rule | Order/discount decision | `orderId`, `reasonCode`, `requestedAmountMinor`, `currency`; never raw free text | If implemented, persist with the decision; rejected requests have no business-state transaction to join | No discount rule or rejection method found; order DTO explicitly says no client discount and current order discount is zero [create-order.dto.ts:7](../../backend/src/orders/dto/create-order.dto.ts#L7), [invoices.service.ts:82](../../backend/src/invoices/invoices.service.ts#L82) | No; no method | **P2** - current code has no discount approval/rejection behavior |

The payment path commits the Payment and invoice balance/status update together, then emits `payment.succeeded` after commit ([payments.service.ts:124](../../backend/src/payments/payments.service.ts#L124)). Receipt creation is a separate listener transaction; its error is logged and does not roll back payment. To make payment-plus-receipt completeness a guaranteed invariant, use a durable outbox/retry or move receipt creation into the payment transaction; the catalogue does not assume that change.

## Business-state events

| Event | Actor | Target | Metadata keys (in addition to target keys) | Transactional? | Code location | Audited today? | Priority |
|---|---|---|---|---|---|---|---|
| `order.draft_changed` (new) | Authenticated creator/editor (thread user ID where absent) | Order or OrderItem | `changeType`, `orderId`, `itemId` if applicable, `productId`, `changedFields`; allowlisted quantity/price minor units only | Yes; same transaction as draft or item mutation | Create/update order [orders.service.ts:62](../../backend/src/orders/orders.service.ts#L62), [orders.service.ts:149](../../backend/src/orders/orders.service.ts#L149); item add/update/remove [orders.service.ts:243](../../backend/src/orders/orders.service.ts#L243), [orders.service.ts:321](../../backend/src/orders/orders.service.ts#L321), [orders.service.ts:368](../../backend/src/orders/orders.service.ts#L368) | No | **P1** - draft edits determine stock reservation and later invoice values |
| `order.confirmed` (new) | `createdByUserId` | Order | `previousStatus`, `newStatus`, `orderNumber`, `invoiceId`, `itemCount` | Yes; same transaction as order, inventory deductions, and invoice creation | [confirmOrder](../../backend/src/orders/orders.service.ts#L464) | No | **P0** - commits a commercial order and inventory/financial consequences |
| `order.processing` (new) | Authenticated processor (currently not passed to service) | Order | `previousStatus`, `newStatus`, `deliveryId` | Yes; same transaction as order transition and delivery creation | [processOrder](../../backend/src/orders/orders.service.ts#L540) | No | **P1** - initiates fulfillment and creates the delivery |
| `order.completed` (new) | Authenticated completer (currently not passed to service) | Order | `previousStatus`, `newStatus` | Yes; same transaction as completion status | [completeOrder](../../backend/src/orders/orders.service.ts#L602) | No | **P1** - terminal business-state transition |
| `order.cancelled` (new) | `createdByUserId` | Order | `previousStatus`, `newStatus`, `inventoryRestored`, `deliveryCancelled` | Yes; same transaction as order, delivery, and any inventory restore | [cancelOrder](../../backend/src/orders/orders.service.ts#L625) | No | **P0** - cancellation can restore stock and cancel fulfillment; must be a complete transaction record |
| `order.deleted` (new) | Authenticated deleter (currently not passed to service) | Draft Order | `orderNumber`, `reasonCode` | Yes; wrap hard delete and audit insert in one transaction | [deleteOrder](../../backend/src/orders/orders.service.ts#L182) | No | **P1** - current draft deletion is a hard delete and otherwise leaves no history |
| `delivery.created` (new) | System, attributed to the order processor | Delivery | `deliveryId`, `orderId`, initial status | Yes; same transaction as order transition to PROCESSING | Creation [deliveries.service.ts:73](../../backend/src/deliveries/deliveries.service.ts#L73), caller [orders.service.ts:540](../../backend/src/orders/orders.service.ts#L540) | No | **P1** - records fulfillment resource creation |
| `delivery.status_changed` (new) | Authenticated actor (currently not accepted by transition methods) | Delivery | `previousStatus`, `newStatus`, `orderId`, `reasonCode`; never free-text failure/cancellation reason | Yes; same transaction as the locked delivery transition | Assignment/pickup/transit/delivered/failed/cancel entry points [deliveries.service.ts:167](../../backend/src/deliveries/deliveries.service.ts#L167), [deliveries.service.ts:185](../../backend/src/deliveries/deliveries.service.ts#L185), [deliveries.service.ts:196](../../backend/src/deliveries/deliveries.service.ts#L196), [deliveries.service.ts:204](../../backend/src/deliveries/deliveries.service.ts#L204), [deliveries.service.ts:215](../../backend/src/deliveries/deliveries.service.ts#L215), [deliveries.service.ts:230](../../backend/src/deliveries/deliveries.service.ts#L230); shared locked save [deliveries.service.ts:245](../../backend/src/deliveries/deliveries.service.ts#L245) | No | **P1** - protects dispatch/delivery state and captures failure/cancellation codes without PII |
| `inventory.adjusted` (new) | `createdByUserId` (human or service actor) | InventoryMovement | `movementId`, `productId`, `type`, `quantity`, `resultingQuantity`, `sourceOrderId` if applicable, normalized `reasonCode` | Yes; same transaction as inventory balance and movement insert; also join order transaction when invoked by confirm/cancel | [adjustInventory](../../backend/src/products/inventory.service.ts#L115), core save [inventory.service.ts:91](../../backend/src/products/inventory.service.ts#L91) | No | **P0** - stock movement changes a financially material asset and must reconcile to its balance |
| `product.status_changed` (new) | Authenticated updater (thread actor ID) | Product | `previousStatus`, `newStatus` (`active`/`archived`), `changedFields` | Yes; same transaction as update | [updateProduct](../../backend/src/products/products.service.ts#L106) | No | **P1** - archive/reactivation controls sellable catalog and stock flow |
| `product.deleted` (new) | Authenticated deleter (thread actor ID) | Product | `previousStatus`, `reasonCode` | Yes; same transaction as soft-delete and audit insert | [deleteProduct](../../backend/src/products/products.service.ts#L148) | No | **P1** - soft deletion can hide an operational/financial asset |
| `customer.status_changed` (new) | Authenticated updater (thread actor ID) | Customer | `previousStatus`, `newStatus`, `changedFields` | Yes; same transaction as update | [updateCustomer](../../backend/src/customers/customers.service.ts#L182) | No | **P1** - active/inactive/archive state changes affect business access and transaction eligibility |
| `customer.deleted` (new) | Authenticated deleter (thread actor ID) | Customer | `previousStatus`, `reasonCode` | Yes; same transaction as soft-delete and audit insert | [deleteCustomer](../../backend/src/customers/customers.service.ts#L246) | No | **P1** - preserves provenance when a customer record is hidden |
| `customer.address_changed` (new) | Authenticated actor (thread ID into address methods) | CustomerAddress | `customerId`, `changeType`, `changedFields` only | Yes; same transaction as address insert/update/delete; no address values in audit | Add/update/delete [customers.service.ts:258](../../backend/src/customers/customers.service.ts#L258), [customers.service.ts:293](../../backend/src/customers/customers.service.ts#L293), [customers.service.ts:320](../../backend/src/customers/customers.service.ts#L320) | No | **P1** - address changes can redirect a delivery; full addresses are PII and must not be copied |
| `supplier.status_changed` (new) | Authenticated updater (thread actor ID) | Supplier | `previousStatus`, `newStatus` (`active`/`archived`), `changedFields` | Yes; same transaction as update | [updateSupplier](../../backend/src/suppliers/suppliers.service.ts#L66) | No | **P1** - archive/reactivation changes business counterpart availability |
| `supplier.deleted` (new) | Authenticated deleter (thread actor ID) | Supplier | `previousStatus`, `reasonCode` | Yes; same transaction as soft-delete and audit insert | [deleteSupplier](../../backend/src/suppliers/suppliers.service.ts#L90) | No | **P1** - preserves provenance when supplier record is hidden |

Lower-priority descriptive profile edits (non-status customer/supplier details and non-critical product catalogue fields) can use the same event family with a `changedFields` allowlist, but should not copy raw values. Product prices/costs are financial data: if audit readers need before/after values, make that an explicit allowlist in minor units and restrict it to the authorized tenant readers.

## Priority summary and enum impact

P0 is intentionally limited to events that prove access/session security, tenant ownership/access changes, payment/invoice state, order commitment/cancellation, and inventory movement. Existing enum values required by P0 are: `user.login`, `user.logout`, `organization.created`, and `role.changed`.

The **new values required for P0** are exactly:

```text
user.login_failed
user.session_revoked
user.deleted
organization.member_added
organization.member_removed
organization.ownership_transferred
payment.recorded
invoice.status_changed
order.confirmed
order.cancelled
inventory.adjusted
```

The **new values required for P1** are exactly:

```text
user.access_denied
user.session_rotated
organization.updated
organization.deactivated
invitation.revoked
invoice.created
invoice.updated
receipt.issued
receipt.regenerated
receipt.voided
order.draft_changed
order.processing
order.completed
order.deleted
delivery.created
delivery.status_changed
product.status_changed
product.deleted
customer.status_changed
customer.deleted
customer.address_changed
supplier.status_changed
supplier.deleted
```

P1 also uses already-existing enum values `user.registered`, `password.reset`, `invitation.sent`, and `invitation.accepted`; they need no new enum labels. Password reset and organization deactivation remain future service/route work, not current implementations. P2 items (`invitation.expired`, receipt reconciliation, discount rejection, low-risk profile updates) are deliberately excluded from this additive migration.

### Proposed migration and rollback

Do **not** write this migration as part of AUD-02. One forward TypeORM migration can add the full new P0+P1 set with additive PostgreSQL operations of this shape:

```sql
ALTER TYPE public.audit_logs_action_enum ADD VALUE IF NOT EXISTS 'user.login_failed';
-- Repeat for each of the exact P0 and P1 new values listed above.
```

PostgreSQL enum labels are not cleanly dropped with a simple inverse `ALTER TYPE`; relying on removal in a normal `down` migration is unsafe and can fail if rows already use a label. Recommended rollback is to roll back application code first and leave unused enum labels in place (the migration down is intentionally a no-op for labels). If strict removal is ever required, it is a separate, carefully coordinated type-rebuild operation: verify no rows use the labels, create a replacement enum, cast dependent columns, swap types, and account for locks/dependencies. Do not delete audit rows merely to make enum rollback possible.

## Integrity and attribution requirements

1. **Append-only at the database boundary:** add a `BEFORE UPDATE OR DELETE` trigger on `audit_logs` that raises an error, and revoke `UPDATE` and `DELETE` from the application database role while granting only required `INSERT`/`SELECT`. The trigger blocks both operations even if application code accidentally calls an update/delete API. Keep owner/superuser access for controlled operations only; privileged operators can bypass database protections and require separate governance.
2. **Foreign-key side effects:** an `ON DELETE SET NULL` action is itself an `UPDATE` to an audit row, and will be rejected by the append-only trigger. The existing organization and actor FKs therefore cannot retain `SET NULL` if the table becomes immutable.
3. **Organization attribution:** normal organization lifecycle must be soft-delete/deactivate only. The organization entity already inherits `BaseEntity` (with soft-delete semantics) and has a status enum ([organization.entity.ts:4](../../backend/src/organizations/entities/organization.entity.ts#L4)); no organization hard-delete service was found. Change the audit organization FK to `ON DELETE RESTRICT`/`NO ACTION` (or remove that FK while retaining the UUID) and prohibit normal physical organization deletion. Preserve `organization_id` forever on historical events.
4. **Actor attribution:** users are also soft-deleted in the normal service path ([users.repository.ts:169](../../backend/src/users/users.repository.ts#L169)). Decide whether the audit actor FK becomes `RESTRICT`/`NO ACTION` or is removed so the immutable UUID survives a physical user deletion. Do not keep `ON DELETE SET NULL` with an update-blocking trigger. A user hard-delete should not silently erase the actor identity.
5. **Current mutation inventory:** no application code currently updates or deletes audit rows. Current hard deletes affect other tables (for example memberships and draft orders); they do not call `AuditLog`. The existing audit migration's `down` drops the entire table as schema rollback, not as application row mutation.
6. **Same-transaction rule:** insert the audit row using the same TypeORM transaction manager as each mutation. A missing audit insert must roll back a P0/P1 state change rather than reporting success without a record. External email and current asynchronous receipt creation need an outbox/retry or explicitly accepted boundary; never claim an audit row proves external delivery.

## Read API notes

- Enforce `AUDIT_LOG_READ` for **Owner and Admin only**, scoped to the currently authorized organization. No such permission or audit read endpoint was found in the current authorization enum/matrix; add the permission and grant it only to Owner/Admin when implementing the API.
- Offer filters: `actorId`, exact `action`, `targetType` + `targetId`, inclusive/exclusive UTC `from`/`to` range, and opaque cursor pagination. Always constrain by organization from the authorized route context rather than trusting a caller-supplied tenant ID.
- Use keyset cursor ordered by `(created_at DESC, id DESC)`, with a bounded `limit` (recommended default 50, maximum 100). Return a next cursor, not an unbounded page number/offset.
- Read only allowlisted metadata keys by action; drop unknown keys and recursively redact values matching token/password/hash/secret/email/phone/address/note patterns. Never expose invitation or auth tokens, password/token hashes, secrets, full PII, or arbitrary free text. Treat IP address and user agent as sensitive security data; omit by default or expose only to the same Owner/Admin policy with a documented need and retention limit.
- Return stable IDs and safe summaries rather than hydrated user/customer/invoice entities. A deleted actor can display as an ID (or a deliberately generic deleted-user label), but must not be joined in a way that changes historical attribution.

## Open questions for the CTO

1. **P0 failed-login volume:** approve durable recording of invalid credentials? Recommended default: yes, with rate limits, per-IP/account bucketing, retention, and alerts; never retain the submitted email.
2. **Refresh-token rotations:** should every successful token rotation be persisted (`user.session_rotated`, P1), or only session start/revocation and suspicious reuse to reduce high-volume audit data? Recommended default: record successful session start and all revocations/reuse; rotate events only if operational monitoring needs them.
3. **Password reset and organization deactivation:** neither workflow exists. Recommended default: keep `password.reset` and `organization.deactivated` in P1 enum preparation only if implementation is in the NGN release scope; otherwise defer those labels until the workflows are approved.
4. **Invitation semantics:** the invitation row commits before SMTP send. Should `invitation.sent` mean an invitation was created/queued or email delivery was confirmed? Recommended default: use an outbox and distinguish queued from delivery outcome; never expose or store the invitation token in audit metadata.
5. **Receipt durability:** payment commits before the asynchronous receipt listener runs, and a listener failure currently only logs an error. Recommended default: add a durable retry/outbox or create the receipt in the payment transaction before claiming payment-plus-receipt completeness.
6. **Actor foreign key and retention:** should physical user deletion be prohibited, or should the actor FK be removed while retaining the immutable user UUID? Recommended default: prohibit normal physical deletion and use `RESTRICT`/`NO ACTION`; define legal retention/anonymization separately without mutating audit rows.
7. **Scope and redaction:** confirm whether Owner/Admin may see authentication IP/user-agent and financial amount metadata, and define retention/export policy. Recommended default: tenant-scoped Owner/Admin only; allowlist fields per action; restrict IP/UA to a justified security view.
8. **Static permission changes:** confirm that permission-matrix edits are governed by code review/deployment audit rather than runtime `audit_logs`. Recommended default: keep them in source-control review; there is no runtime matrix editor to instrument.
