import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';

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
   * The user who created this customer record. Modeled as a bare
   * uuid column with no FK relation or DB constraint — matching
   * OrganizationMember.invitedBy, the closest existing precedent for
   * an "acting user" reference on a business/tenant-scoped entity.
   * (Invitation.invitedBy instead carries a full @ManyToOne with
   * onDelete: CASCADE — see the architectural discrepancy note in
   * the implementation report; that pattern was not reused here
   * since CASCADE would delete customer records if the creating
   * user's account were ever removed, which is not acceptable for
   * business data.)
   */
  @Column({ type: 'uuid', name: 'created_by' })
  createdBy: string;
}
