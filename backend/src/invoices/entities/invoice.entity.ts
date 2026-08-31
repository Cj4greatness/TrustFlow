import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { KoboTransformer } from '../../common/transformers/kobo.transformer';

/**
 * Invoice lifecycle. DRAFT/APPROVED/ISSUED/PARTIALLY_PAID/PAID.
 *
 * RATIFIED (two-stage approval): DRAFT -> APPROVED is an internal
 * step (Permission.INVOICE_APPROVE) before the invoice is issued to
 * the customer (DRAFT -> APPROVED -> ISSUED). An invoice cannot skip
 * APPROVED and go straight to ISSUED. Transitions are enforced in the
 * service layer via explicit status checks, not by this enum alone —
 * mirrors OrderStatus's enforcement pattern.
 *
 * NOT YET RATIFIED: a VOID/CANCELLED terminal state and refund
 * handling remain open (architecture.md §29, "Refund scope for v1").
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  ISSUED = 'issued',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
}

/**
 * Invoice
 *
 * The tenant-scoped financial record generated from a confirmed
 * Order.
 *
 *  - Money: all monetary columns are `bigint` (kobo), via
 *    KoboTransformer. Diverges from Order's decimal(12,2)-as-string
 *    columns; any code reading Order.total alongside Invoice amounts
 *    MUST explicitly convert (Math.round(parseFloat(order.total) * 100)).
 *
 *  - Overpayment (RATIFIED): if a Payment would push amountPaid above
 *    total, the payment is still accepted and amountPaid/amountDue
 *    updated accordingly, but the invoice must be flagged for manual
 *    review rather than silently reconciled. NOT YET IMPLEMENTED here
 *    — this is a PaymentsService concern (doesn't exist yet). When
 *    built, PaymentsService needs to set some review flag on Invoice — flaggedForReview, added below — when
    amountPaid > total. Set by PaymentsService.applyPayment(), not by
    anything in this module.
 *
 *  - Receipt: no ReceiptsService/Receipt entity — generated as a
 *    Payment sub-resource once a Payment reaches SUCCESS.
 *
 * invoiceNumber is unique per organization (RATIFIED format:
 * year-prefixed, e.g. INV-2026-000123, resetting to 1 each calendar
 * year per organization) — assigned via InvoiceCounter with a
 * pessimistic row lock, see InvoicesService.nextInvoiceNumber().
 */
@Entity('invoices')
@Index(['organizationId'])
@Index(['organizationId', 'invoiceNumber'], { unique: true })
@Index(['organizationId', 'orderId'])
export class Invoice extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 20, name: 'invoice_number' })
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ type: 'timestamptz', name: 'issue_date', nullable: true })
  issueDate: Date | null;

  @Column({ type: 'timestamptz', name: 'due_date', nullable: true })
  dueDate: Date | null;

  @Column({
    type: 'bigint',
    name: 'subtotal',
    default: 0,
    transformer: new KoboTransformer(),
  })
  subtotal: number;

  @Column({
    type: 'bigint',
    name: 'discount_amount',
    default: 0,
    transformer: new KoboTransformer(),
  })
  discountAmount: number;

  @Column({
    type: 'bigint',
    name: 'tax_amount',
    default: 0,
    transformer: new KoboTransformer(),
  })
  taxAmount: number;

  @Column({
    type: 'bigint',
    name: 'total',
    default: 0,
    transformer: new KoboTransformer(),
  })
  total: number;

  @Column({
    type: 'bigint',
    name: 'amount_paid',
    default: 0,
    transformer: new KoboTransformer(),
  })
  amountPaid: number;

  @Column({
    type: 'bigint',
    name: 'amount_due',
    default: 0,
    transformer: new KoboTransformer(),
  })
  amountDue: number;
  @Column({
    type: 'boolean',
    name: 'flagged_for_review',
    default: false,
  })
  flaggedForReview: boolean;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.invoice)
  lineItems: InvoiceLineItem[];
}
