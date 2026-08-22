import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { CustomerAddress } from '../../customers/entities/customer-address.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Order lifecycle. DRAFT/CONFIRMED/PROCESSING/COMPLETED/CANCELLED.
 * Per Orders Directive v1 §2/§18 (explicitly confirmed): PROCESSING
 * is mandatory — CONFIRMED cannot skip directly to COMPLETED.
 * COMPLETED and CANCELLED are terminal states. Enforced in the
 * service layer via an explicit allowed-transitions table, not by
 * this enum alone.
 */
export enum OrderStatus {
  DRAFT = 'draft',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Order
 *
 * The tenant-scoped business record of a customer's order. Per
 * Directive v1 §5, Orders preserve their historical validity even if
 * the referenced Customer is later archived or soft-deleted — the
 * FK relation exists for querying, not as a live dependency the
 * order's correctness relies on.
 *
 * subtotal/discount/total are server-calculated at confirmation time
 * (Directive §14 rule 7/8: "Order totals are calculated server-side.
 * Client-provided totals must not be trusted.") — never accepted
 * directly from a client DTO as authoritative values.
 *
 * orderNumber is unique per organization (Directive §10), assigned
 * via OrderCounter with a pessimistic row lock — see
 * OrdersService.createOrder(), which reuses the concurrency-safe
 * pattern proven in InventoryService.adjustInventory().
 *
 * shippingAddressId (Sprint 6 CTO Directive, Delivery foundation):
 * nullable, references CustomerAddress. RATIFIED this session:
 * optional at creation, settable any time while DRAFT (same rule as
 * notes/customerId), but the service layer requires it to be set
 * before OrdersService.processOrder() can succeed — that's the
 * moment Delivery auto-creates and genuinely needs a real address.
 * onDelete: SET NULL, not CASCADE — deleting an address must not
 * delete the Order it was once attached to.
 */
@Entity('orders')
@Index(['organizationId'])
@Index(['organizationId', 'orderNumber'], { unique: true })
export class Order extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid', name: 'shipping_address_id', nullable: true })
  shippingAddressId: string | null;

  @ManyToOne(() => CustomerAddress, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shipping_address_id' })
  shippingAddress: CustomerAddress | null;

  @Column({ type: 'varchar', length: 20, name: 'order_number' })
  orderNumber: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.DRAFT,
  })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
