import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Business lifecycle state — deliberately independent of BaseEntity's
 * deletedAt (soft delete), mirroring Customer.status/CustomerStatus.
 * A product can be ARCHIVED (no longer sold/stocked) while deletedAt
 * stays null, remaining queryable for historical orders/reporting.
 * deletedAt is reserved for data-lifecycle removal, not business
 * status. Per CTO Directive v1 §8.
 */
export enum ProductStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * Product
 *
 * The tenant-scoped record of an item an organization sells, manages,
 * or holds in inventory. Per CTO Directive v1 §5, each independently
 * stocked/sold variant is its own Product in v1 — there is no
 * first-class ProductVariant hierarchy.
 *
 * organizationId ownership follows the Customer-module pattern
 * established during the Sprint 3 RBAC audit: the service layer
 * re-checks product.organizationId against the acting request's
 * organization on every load, rather than trusting the query alone.
 *
 * SKU is organization-scoped and unique (Directive §4) — the same
 * SKU may exist under two different organizations, but never twice
 * within one. See the partial unique index below.
 */
@Entity('products')
@Index(['organizationId'])
@Index(['organizationId', 'sku'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class Product extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100 })
  sku: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'selling_price',
  })
  sellingPrice: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'cost_price',
  })
  costPrice: string | null;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  /**
   * The user who created this product record. Follows the
   * established Invitation.invitedBy/inviter and
   * Customer.createdBy/creator convention: a bare uuid column for
   * the FK value plus a separately-named @ManyToOne relation
   * (here `creator`), onDelete: 'CASCADE'.
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
