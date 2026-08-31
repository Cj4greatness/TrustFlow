import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';

/**
 * OrderItem
 *
 * Deliberately does NOT extend BaseEntity — no deletedAt (confirmed
 * decision: item removal only happens pre-confirmation, via hard
 * delete, before anything historically significant occurs; once an
 * Order leaves DRAFT, items become immutable per Directive v1 §14
 * rule 5, so there's no "soft-deleted but still relevant" state to
 * preserve). Still carries its own id/createdAt/updatedAt directly
 * rather than inheriting them, since BaseEntity also brings
 * deletedAt along with it.
 *
 * productName, sku, and unitPrice are a deliberate historical
 * snapshot (Directive §3) — captured at item-creation time and never
 * updated when the referenced Product changes name, price, or
 * archives. This is the entity's core purpose: an Order from
 * yesterday must show yesterday's price, even if today's Product
 * price differs.
 *
 * organizationId is denormalized for the same tenant-isolation
 * reason as every other child entity tonight (Inventory,
 * CustomerAddress, SupplierProduct).
 */
@Entity('order_items')
@Index(['organizationId'])
@Index(['orderId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  /**
   * Snapshot fields — copied from Product at item-creation time,
   * never re-read from the live Product relation afterward.
   */
  @Column({ type: 'varchar', length: 255, name: 'product_name' })
  productName: string;

  @Column({ type: 'varchar', length: 100 })
  sku: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'unit_price' })
  unitPrice: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
