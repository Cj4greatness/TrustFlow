# Successful payment without receipt gap — November 2026

## Scope

This investigation covers the in-process `payment.succeeded` listener in this
checkout. It does not implement an outbox or change receipt/payment schemas.
It is not evidence that every gap in the local test database came from
production: the local database is reset and repopulated by e2e runs.

## A. Event and handler evidence

The emit remains after `recordPayment()` has committed its database transaction:
`backend/src/payments/payments.service.ts:124-129`. It emits
`payment.succeeded` with payment, invoice, organization and amount fields.
The service comment already notes that invoice consistency is synchronous but
Communication Hub delivery is event-driven:
`backend/src/payments/payments.service.ts:44-48`.

The receipt handler is registered with `@OnEvent('payment.succeeded')` and is
async: `backend/src/receipts/receipts.service.ts:54-55`. It awaits the receipt
creation method, but `PaymentsService` calls plain
`EventEmitter2.emit()` and does not await the listener:
`backend/src/payments/payments.service.ts:124-129`.

The handler catches every exception, logs an error, and does not rethrow:
`backend/src/receipts/receipts.service.ts:56-68`. Therefore a handler failure
does not roll back an already committed payment and leaves no receipt. This is
recoverable proof-gap, not a payment-ledger corruption.

The handler reads the payment and invoice inside a new TypeORM transaction,
loads settings, locks and increments a per-organization receipt counter, then
creates and saves the receipt:
`backend/src/receipts/receipts.service.ts:71-142` and
`backend/src/receipts/receipts.service.ts:189-211`.

Idempotency is:

- pre-check in `findByPaymentId()`:
  `backend/src/receipts/receipts.service.ts:64-69`;
- repository lookup:
  `backend/src/receipts/receipts.repository.ts:29-38`;
- DB uniqueness on `(organizationId, paymentId)`:
  `backend/src/receipts/entities/receipt.entity.ts:54-57`;
- unique-violation catch and re-fetch:
  `backend/src/receipts/receipts.service.ts:130-142`.

### Ways a successful payment can be without a receipt

1. **Listener failure or database error:** The handler catches transaction,
   settings, payment lookup, invoice lookup, counter, insert, or connection
   errors and logs only. The payment remains successful.
2. **Handler is not awaited:** `emit()` does not represent a completion barrier
   for async Nest listener work.
3. **Process stops between payment commit and listener completion:** the process
   can exit or be restarted after commit, before handler completion or receipt
   commit.
4. **Receipt settings failure:** settings lookup generally creates an in-memory
   default if no settings row exists:
   `backend/src/receipt-settings/receipt-settings.service.ts:25-42`, so a missing
   settings row is not normally fatal. Database or organization lookup failures
   remain possible listener failures.
5. **No tenant/payment match:** handler exits through an exception if the
   payment or invoice cannot be found for the event organization:
   `backend/src/receipts/receipts.service.ts:72-91`.
6. **Unique-violation race:** the catch re-fetches and returns the existing
   receipt; it does not create a duplicate.
7. **Emitted event never reaches a registered listener:** if the app/worker
   starts or closes around the point of emission, or Nest's listener registry
   is not ready, no listener runs. The local process had no durable queue.
8. **E2e app closes before async listener work settles:** this is reproducible
   as a test-timing risk because the listener is async and not awaited by HTTP
   payment handling.

No status guard inside `createReceiptForPayment()` skips successful payments,
and no organization-currency guard affects receipt creation.

## B. Local database characterization

All queries were run under:

```sql
BEGIN READ ONLY;
-- aggregates
ROLLBACK;
```

The read-only database snapshot found:

- **121** successful payments without a receipt.
- **115** affected organizations.
- **114** affected payments' organizations had a live receipt-settings row;
  **7** did not.
- **119** missing receipts belonged to `partially_paid` invoices and **2** to
  `paid` invoices.
- All 121 successful gaps had `confirmed_at` set and `confirmed_by` set.
- All 121 referenced an existing invoice in the same organization.
- Gaps span 26 calendar days from 2026-08-21 through 2026-11-22, with the
  largest daily cluster on 2026-11-10 (18), but they are distributed across
  many e2e-era dates and hours rather than one outage window.
- A `failed` payment has no receipt as normal: the local aggregate found 83
  failed payments with no receipt, which is not a gap.

No successful-gap row had a missing invoice or missing confirmation metadata.
No successful-gap row had an obviously different direct-DB shape.

The codebase search found direct receipt-lifecycle test creation of a
**failed** Payment at
`backend/test/smoke/receipts-lifecycle.e2e-spec.ts:591-603`; it is not counted
as a successful gap. Successful Payment creation was found in
`PaymentsService.recordPayment()` and in finance/AI e2e calls. The distribution
across 115 organizations strongly suggests mostly isolated test-created
organizations, but SQL cannot prove which spec created each organization.

**Confidence: medium (about 70%).** There is strong evidence that the rows are
real successful payments lacking receipts and no settings-row dependency is
fatal. The best-supported explanation is repeated e2e app-start/close or
timing windows around listener completion, but the database snapshot alone
cannot prove every historical path or rule out process-stop/DB-timing causes.

## C. Reproducibility

The isolated reconciliation spec deliberately replaces
`createReceiptForPayment()` with a test double that rejects. An HTTP successful
payment then remains without a receipt, and the reconciliation query identifies
it. This proves handler failure can produce the gap without changing production
code.

The gap was not proven from an app-close-only timing run. Closing a test app
before a handler settles is possible from the same async semantics, but it would
be timing-dependent and should not be reported as a confirmed local cause.

## D. Persistent environment sizing

Operators must run the read-only transaction file:

```sql
\i docs/receipt-gap-sizing.sql
```

The file contains no names, emails, amounts, or other personal data. It reports:

- total successful payments without a receipt;
- affected organization count;
- oldest/newest confirmed payment timestamps;
- count per organization;
- count per payment day.

**No action needed** means the first aggregate is `0` successful payments
without a receipt. Counts of failed or pending payments are ignored.

## E. Outbox assessment

The strongest release trade-off is:

- **Idempotent reconciliation is sufficient for the December NGN release** if
  it is scheduled or run during a controlled maintenance window and operators
  monitor the gap count. It repairs a proof gap without moving money.
- **A transactional outbox would be stronger** because it makes receipt creation
  durable and retryable. It would add schema/migration, producer and worker
  changes, retry/dead-letter policy, and operational monitoring.
- Because the CTO explicitly excluded migration/outbox work and reconciliation
  can use the existing unique constraint and receipt counter safely, add
  reconciliation now and reassess an outbox only if production sizing or retry
  incidents show recurring gaps.

## Reconciliation runbook

### Dry-run

Run from `backend/`:

```bash
pnpm reconcile:receipts
pnpm reconcile:receipts -- --limit=500
pnpm reconcile:receipts -- --organizationId=<uuid>
```

The default prints candidate payment IDs and writes nothing.

### Execute

```bash
pnpm reconcile:receipts -- --execute --limit=100
```

`--execute` is mandatory for writes. The run is capped at 100 by default and
10,000 in code. It processes successful, receipt-less payments in
organization/payment-confirmation order.

### Verification

Run the same read-only sizing file again. No action is needed when the
successful-payment-without-receipt count is zero. You may also verify every
reconciled payment has exactly one receipt by payment ID; the unique
`(organization_id, payment_id)` index prevents duplicates.

## Risks

- Reconciliation is a catch-up procedure, not a durable guarantee.
- It creates a receipt only from a successful, existing payment and invoice.
- Receipt numbering uses the existing per-organization counter and lock.
- Settings snapshots use the current receipt settings through the same settings
  fallback and are not rewritten for existing receipts.
- If settings or database access fails, reconciliation aborts per invocation
  according to the existing transaction and reports the failure.
- A gap may recur until an outbox or another durable mechanism is adopted.
