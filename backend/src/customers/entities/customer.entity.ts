import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export enum CustomerType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}

/**
 * Business state of the customer relationship — deliberately
 * independent of BaseEntity's deletedAt (soft delete). A customer
 * can be ARCHIVED (business says "we're done with this customer")
 * while deletedAt stays null, and remain fully queryable for
 * reporting/history. deletedAt is reserved for data-lifecycle
 * removal (e.g. a deletion request), not business status.
 */
export enum CustomerStatus {
  LEAD = 'lead',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

/**
 * Customer
 *
 * The tenant-scoped record of a person or business TrustFlow's
 * customer (the organization) transacts with. Every row carries an
 * organizationId — per the isolation invariant established during
 * the Sprint 3 RBAC audit, a member of one organization must never
 * be able to read or mutate another organization's customers, even
 * given the row's UUID directly. Enforcement follows the existing
 * pattern used by OrganizationMembersService: the service layer
 * re-checks customer.organizationId against the acting request's
 * organization on every load, rather than trusting the query alone.
 *
 * customerType decides which name fields are meaningful:
 * firstName/lastName for INDIVIDUAL, companyName for BUSINESS.
 * displayName is always populated (by the service layer) so list
 * views never need to branch on customerType to render a label.
 */
@Entity('customers')
@Index(['organizationId'])
@Index(['organizationId', 'email'], {
  unique: true,
  where: '"email" IS NOT NULL AND "deleted_at" IS NULL',
})
export class Customer extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: CustomerType,
    name: 'customer_type',
  })
  customerType: CustomerType;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'first_name' })
  firstName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'last_name' })
  lastName: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'company_name',
  })
  companyName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({
    type: 'enum',
    enum: CustomerStatus,
    default: CustomerStatus.LEAD,
  })
  status: CustomerStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string | null;

  /**
   * The user who created this customer record. Follows the
   * established Invitation.invitedBy/inviter convention: a bare
   * uuid column for the FK value plus a separately-named @ManyToOne
   * relation (here `creator`) pointing at the same column via
   * @JoinColumn, with onDelete: 'CASCADE' — mirrored exactly per
   * CTO decision, closing the discrepancy raised after Step 1.
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
