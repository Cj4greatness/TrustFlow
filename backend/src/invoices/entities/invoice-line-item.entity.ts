import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { Invoice } from './invoice.entity';
import { Product } from '../../products/entities/product.entity';
import { KoboTransformer } from '../../common/transformers/kobo.transformer';

/**
 * InvoiceLineItem
 *
 * A single billed line on an Invoice. Unlike Invoice → Order/Customer
 * (non-owning references kept for querying and historical validity —
 * see Invoice class doc), InvoiceLineItem is owned by its Invoice: it
 * is created and deleted with the parent, so the Invoice relation
 * uses `onDelete: 'CASCADE'` as a genuine composition relationship,
 * not just historical-preservation CASCADE.
 *
 * description and unitPrice are snapshotted from Product at the
 * moment the line is created — same principle as Order not depending
 * on live Customer state (Directive v1 §5). If the Product's name or
 * price changes afterward, this line must not change. productId is
 * nullable to allow ad-hoc/custom line items not tied to a catalog
 * Product.
 *
 * lineTotal is server-calculated (quantity * unitPrice) in
 * InvoicesService, never accepted from a client DTO as authoritative
 * — same rule as Order/Invoice totals (Directive §14 rule 7/8).
 *
 * MONEY: unitPrice/lineTotal are `bigint` (kobo) via KoboTransformer,
 * consistent with Invoice — see Invoice class doc for why this
 * diverges from Order's decimal(12,2) convention.
 *
 * organizationId is denormalized here (not derived via a join through
 * Invoice) purely for tenant-scoped query/index performance — mirrors
 * the reasoning already applied to Invoice.customerId. Confirm this
 * matches whatever pattern an OrderLineItem/OrderItem entity already
 * uses, if one exists, so the two modules stay consistent.
 *
 * No createdBy/creator on this entity: it's a child record created
 * transactionally with its parent Invoice, so the audit trail lives
 * at the Invoice level, not per line.
 */
@Entity('invoice_line_items')
@Index(['organizationId'])
@Index(['invoiceId'])
export class InvoiceLineItem extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'invoice_id' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.lineItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  /** Snapshot of the Product name/description at time of billing. */
  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'int' })
  quantity: number;

  /** Minor units (kobo), via KoboTransformer. Snapshot of Product price at time of billing. */
  @Column({
    type: 'bigint',
    name: 'unit_price',
    default: 0,
    transformer: new KoboTransformer(),
  })
  unitPrice: number;

  /** Minor units (kobo), via KoboTransformer. Server-calculated: quantity * unitPrice. */
  @Column({
    type: 'bigint',
    name: 'line_total',
    default: 0,
    transformer: new KoboTransformer(),
  })
  lineTotal: number;
}
