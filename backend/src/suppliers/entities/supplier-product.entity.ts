import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Supplier } from './supplier.entity';
import { Product } from '../../products/entities/product.entity';

/**
 * SupplierProduct
 *
 * The association between a Supplier and a Product they provide,
 * carrying supplier-specific procurement data (cost, lead time, MOQ)
 * per Directive v1 §5 — deliberately not a bare TypeORM @ManyToMany,
 * since that data is what makes this useful to future procurement
 * intelligence ("Supplier A supplies SKU X for ₦8,500, 7-day lead
 * time, MOQ 20" vs. just "related to").
 *
 * organizationId is denormalized for the same tenant-isolation
 * reason as Inventory/CustomerAddress: keeps the isolation check a
 * single-column comparison rather than a join through Supplier or
 * Product. Both the supplier and product referenced must belong to
 * the same organization — enforced in the service layer at
 * creation time, not by a DB constraint (matching how cross-field
 * business rules live in the service throughout this codebase).
 *
 * Extends BaseEntity (soft-deletable) — an explicit decision:
 * unlike OrganizationMember (hard-deleted, "a removed membership
 * genuinely no longer exists"), a removed supplier-product
 * association has historical value (past pricing/lead-time terms)
 * worth preserving for reporting, matching CustomerAddress's
 * reasoning rather than OrganizationMember's.
 *
 * unitCost is string-typed for the same reason as
 * Product.sellingPrice/costPrice — TypeORM's honest representation
 * of a `decimal` column with no transformer configured.
 */
@Entity('supplier_products')
@Index(['organizationId'])
@Index(['supplierId'])
@Index(['productId'])
@Index(['organizationId', 'supplierId', 'productId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class SupplierProduct extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'supplier_id' })
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'supplier_sku',
  })
  supplierSku: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'unit_cost',
  })
  unitCost: string | null;

  @Column({ type: 'int', nullable: true, name: 'lead_time_days' })
  leadTimeDays: number | null;

  @Column({ type: 'int', nullable: true, name: 'minimum_order_quantity' })
  minimumOrderQuantity: number | null;
}
