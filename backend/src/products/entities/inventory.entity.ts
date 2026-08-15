import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Product } from './product.entity';

/**
 * Inventory
 *
 * The organization's current stock state for a product. Per CTO
 * Directive v1 §9, each product has at most one Inventory record in
 * v1 — multi-location/warehouse inventory is explicitly deferred
 * (§10). Enforced here via a unique index on productId.
 *
 * organizationId is denormalized rather than reached solely via the
 * product relation, matching the CustomerAddress/CustomerNote
 * pattern — keeps tenant-isolation checks a single-column comparison
 * instead of a join through Product.
 *
 * quantity >= 0 is a core invariant (Directive §6) enforced at the
 * service layer on every adjustment, not by a DB CHECK constraint —
 * matching how displayName's business rules live in the service
 * rather than the schema, for consistency with the rest of the
 * codebase's validation placement.
 */
@Entity('inventories')
@Index(['organizationId'])
export class Inventory extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'product_id' })
  @Index({ unique: true })
  productId: string;

  @OneToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({
    type: 'int',
    nullable: true,
    name: 'low_stock_threshold',
  })
  lowStockThreshold: number | null;
}
