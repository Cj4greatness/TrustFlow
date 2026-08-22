import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Order } from '../../orders/entities/order.entity';
import { Customer } from '../../customers/entities/customer.entity';

/**
 * DeliveryStatus
 *
 * Sprint 6 CTO Directive §24. Primary path: PENDING -> ASSIGNED ->
 * PICKED_UP -> IN_TRANSIT -> DELIVERED. Exceptional paths (§25):
 * PENDING/ASSIGNED -> CANCELLED, IN_TRANSIT -> FAILED. All other
 * transitions (e.g. DELIVERED -> IN_TRANSIT, CANCELLED -> ASSIGNED,
 * FAILED -> DELIVERED) are invalid and rejected in the service layer
 * via an explicit transition table, not by this enum alone — same
 * pattern as OrderStatus/InvoiceStatus.
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Delivery
 *
 * Sprint 6 CTO Directive §23/§26. Represents physical fulfillment of
 * an Order — Order owns the commercial transaction, Delivery owns
 * fulfillment, per §3's "configuration controls presentation, domain
 * records control truth" analog applied to Order/Delivery instead of
 * ReceiptSettings/Receipt.
 *
 * TRIGGER (ratified this session): auto-created when Order moves to
 * PROCESSING (not CONFIRMED, unlike Invoice) — inside the same
 * transaction as that status change, in
 * OrdersService.processOrder(). One Delivery per Order (ratified),
 * enforced via a unique index on (organizationId, orderId).
 *
 * ADDRESS SNAPSHOT: deliveryAddressLine1/2/City/State/PostalCode/
 * Country are copied from Order.shippingAddress (a CustomerAddress)
 * at Delivery-creation time, never re-read from the live
 * CustomerAddress afterward — same historical-snapshot principle as
 * InvoiceLineItem snapshotting Product, and Receipt snapshotting
 * ReceiptSettings. A customer editing/deleting their address later
 * must never alter an in-flight or completed delivery's record of
 * where it was actually sent.
 *
 * assignedDeliveryPerson (ratified this session): free-text field,
 * no FK to OrganizationMember or any driver entity — the directive
 * explicitly excludes driver management/fleet infrastructure (§27),
 * and a courier is very often an external, non-platform party (a
 * dispatch rider, a third-party logistics company), not necessarily
 * a TrustFlow user at all.
 *
 * customerId is denormalized from Order.customerId at creation time
 * (same tenant-isolation-shortcut reasoning as CustomerAddress's own
 * denormalized organizationId) — read access to "my deliveries"
 * shouldn't require a join through Order.
 */
@Entity('deliveries')
@Index(['organizationId'])
@Index(['organizationId', 'orderId'], { unique: true })
export class Delivery extends BaseEntity {
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

  @Column({
    type: 'enum',
    enum: DeliveryStatus,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  // --- Address snapshot (see class doc) ---
  @Column({ type: 'varchar', length: 255, name: 'delivery_address_line1' })
  deliveryAddressLine1: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'delivery_address_line2',
    nullable: true,
  })
  deliveryAddressLine2: string | null;

  @Column({ type: 'varchar', length: 100, name: 'delivery_address_city' })
  deliveryAddressCity: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'delivery_address_state',
    nullable: true,
  })
  deliveryAddressState: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'delivery_address_postal_code',
    nullable: true,
  })
  deliveryAddressPostalCode: string | null;

  @Column({ type: 'varchar', length: 100, name: 'delivery_address_country' })
  deliveryAddressCountry: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'tracking_reference',
    nullable: true,
  })
  trackingReference: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'assigned_delivery_person',
    nullable: true,
  })
  assignedDeliveryPerson: string | null;

  @Column({ type: 'timestamptz', name: 'pickup_at', nullable: true })
  pickupAt: Date | null;

  @Column({ type: 'timestamptz', name: 'delivered_at', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'text', name: 'failure_reason', nullable: true })
  failureReason: string | null;

  @Column({ type: 'text', name: 'cancellation_reason', nullable: true })
  cancellationReason: string | null;
}
