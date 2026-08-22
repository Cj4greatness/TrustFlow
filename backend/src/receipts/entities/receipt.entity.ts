import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { Order } from '../../orders/entities/order.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { KoboTransformer } from '../../common/transformers/kobo.transformer';

/**
 * ReceiptStatus
 *
 * Sprint 6 CTO Directive §5: minimal lifecycle, ISSUED -> VOIDED
 * only. No draft/pending states — a Receipt is proof of something
 * that already happened (a successful Payment), so there's nothing
 * to draft.
 */
export enum ReceiptStatus {
  ISSUED = 'issued',
  VOIDED = 'voided',
}

/**
 * Receipt
 *
 * Sprint 6 CTO Directive §4/§6/§8/§19/§20.
 *
 * TRIGGER (ratified this session, deliberately diverging from the
 * Order->Invoice / Payment->Invoice precedent): created by an
 * EventEmitter2 listener on `payment.succeeded`, NOT a synchronous
 * call inside PaymentsService's transaction. This matches §20's
 * literal diagram, but knowingly reintroduces the exact risk the
 * CTO's own Sprint 5 review warned against ("domain events must
 * never be the mechanism that guarantees financial state
 * consistency"). The justification: per §3/§4, Payment is financial
 * TRUTH; Receipt is only PROOF of it. A delayed/missed receipt
 * (if the in-process listener fails silently) doesn't corrupt the
 * ledger the way a missed Invoice or unapplied Payment would — it's
 * recoverable (a future admin "regenerate receipt" action), not
 * silently-wrong money. This reasoning does NOT apply to
 * Invoice/Payment; don't generalize it.
 *
 * IDEMPOTENCY (§20): since there's no client-supplied idempotency
 * key here (creation isn't a direct user action), the safety net is
 * a DB-level unique constraint on (organizationId, paymentId) —
 * one Receipt per Payment, full stop. The listener does a
 * check-then-create with a fallback catch on the unique-violation
 * error, same shape as Payment's idempotency-key race handling.
 *
 * NO CREATE ENDPOINT: §4 explicitly prohibits a generic create
 * endpoint that could manufacture a receipt independent of a real
 * Payment. Combined with creation being fully event-driven, there is
 * no POST /receipts route — matches the Invoice precedent (automatic
 * creation, no manual creation endpoint) already established and
 * approved this session.
 *
 * BRANDING SNAPSHOT (§19): displayNameSnapshot/accentColorSnapshot
 * are copied from ReceiptSettings at creation time and NEVER updated
 * afterward, even if the organization's ReceiptSettings later
 * changes. ReceiptSettings controls future receipts only.
 *
 * Money: amount is bigint (kobo), via KoboTransformer — deliberately
 * diverges from the directive's literal text (which assumed
 * Payment.amount is a decimal string; it's actually bigint kobo per
 * the ratified A1 decision). Matches actual Payment convention, not
 * the directive's incorrect assumption about it.
 */
@Entity('receipts')
@Index(['organizationId'])
@Index(['organizationId', 'receiptNumber'], { unique: true })
@Index(['organizationId', 'paymentId'], { unique: true })
export class Receipt extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'payment_id' })
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ type: 'uuid', name: 'invoice_id', nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => Invoice, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice | null;

  @Column({ type: 'uuid', name: 'customer_id', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ type: 'varchar', length: 20, name: 'receipt_number' })
  receiptNumber: string;

  @Column({
    type: 'bigint',
    name: 'amount',
    transformer: new KoboTransformer(),
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'timestamptz', name: 'payment_date' })
  paymentDate: Date;

  @Column({ type: 'varchar', length: 255, name: 'display_name_snapshot' })
  displayNameSnapshot: string;

  @Column({ type: 'varchar', length: 7, name: 'accent_color_snapshot' })
  accentColorSnapshot: string;

  @Column({
    type: 'enum',
    enum: ReceiptStatus,
    default: ReceiptStatus.ISSUED,
  })
  status: ReceiptStatus;

  @Column({ type: 'timestamptz', name: 'issued_at' })
  issuedAt: Date;
}
