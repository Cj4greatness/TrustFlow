import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Business lifecycle state — distinct from BaseEntity's deletedAt,
 * mirroring Customer.status/ProductStatus. An archived supplier
 * stays queryable for historical records while deletedAt remains
 * null. Per Suppliers Directive v1 §2.
 */
export enum SupplierStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * Supplier
 *
 * The tenant-scoped record of a business/person an organization
 * purchases products or stock from. Per Directive v1 §2, notes and
 * address are single plain fields here — unlike Customer, which
 * models addresses and notes as separate sub-resource entities
 * (CustomerAddress, CustomerNote). That richer structure wasn't
 * specified for Supplier, so it isn't invented here.
 *
 * organizationId ownership follows the established Customer/Product
 * pattern: the service layer re-checks supplier.organizationId
 * against the acting request's organization on every load via
 * getOwnedSupplierOrThrow, rather than trusting the query alone.
 */
@Entity('suppliers')
@Index(['organizationId'])
export class Supplier extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'contact_name',
  })
  contactName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: SupplierStatus,
    default: SupplierStatus.ACTIVE,
  })
  status: SupplierStatus;

  /**
   * Follows the established Invitation.invitedBy/inviter,
   * Customer.createdBy/creator, Product.createdBy/creator
   * convention: bare uuid FK column plus a separately-named
   * @ManyToOne relation, onDelete: 'CASCADE'.
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
