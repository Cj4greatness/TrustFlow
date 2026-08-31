import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';
import { User } from '../../users/entities/user.entity';
import { KoboTransformer } from '../../common/transformers/kobo.transformer';

export enum PaymentMethod {
  MANUAL = 'manual',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/**
 * Payment
 *
 * RATIFIED (idempotency): idempotencyKey is required and client-
 * supplied — the caller (e.g. the "Record Payment" UI action)
 * generates it once and must resend the SAME key on retry. Unique
 * per (organizationId, idempotencyKey). recordPayment() treats a
 * replayed key as returning the original Payment, not an error —
 * standard idempotency-key semantics (same contract as Stripe's
 * Idempotency-Key header), so an accidental double-click or a
 * network retry is a safe no-op rather than a duplicate financial
 * record. See PaymentsService.recordPayment() for the replay logic
 * and the unique-constraint race fallback.
 *
 * Money: `amount` is bigint (kobo), via KoboTransformer — same
 * convention as Invoice, not Order.
 *
 * Invoice consistency is NOT event-driven: PaymentsService applies a
 * successful Payment's amount to Invoice.amountPaid/amountDue/status
 * directly, in the same DB transaction as this row's insert
 * (pessimistic-locked). `payment.succeeded` fires via EventEmitter2
 * only after that transaction commits, for Communication Hub.
 *
 * Overpayment (RATIFIED): allowed, not rejected. Sets
 * Invoice.flaggedForReview = true rather than being blocked or
 * silently clamped.
 *
 * Receipt: no separate Receipt entity — RATIFIED as a Payment
 * sub-resource once status reaches SUCCESS (not yet built).
 */
@Entity('payments')
@Index(['organizationId'])
@Index(['organizationId', 'invoiceId'])
@Index(['organizationId', 'idempotencyKey'], { unique: true })
export class Payment extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'idempotency_key',
  })
  idempotencyKey: string;

  @Column({
    type: 'bigint',
    name: 'amount',
    transformer: new KoboTransformer(),
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.MANUAL,
  })
  method: PaymentMethod;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'provider_reference',
    nullable: true,
  })
  providerReference: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'uuid', name: 'confirmed_by', nullable: true })
  confirmedBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'confirmed_by' })
  confirmer: User | null;

  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
