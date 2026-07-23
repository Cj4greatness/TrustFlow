import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff',
}

/**
 * OrganizationMember
 *
 * Junction entity linking a User to an Organization with a role.
 * A single user can belong to multiple organizations (each
 * membership is its own row here), and a single organization has
 * multiple members — this is the many-to-many relationship the CTO
 * asked us to design for now, even though Sprint 3 only exercises
 * the "one owner per new organization" case.
 *
 * Role permissions themselves are centralized separately (see the
 * RBAC module) rather than duplicated per-membership — this entity
 * only records *which* role a member holds, not what that role can
 * do.
 */
@Entity('organization_members')
@Index(['organizationId', 'userId'], { unique: true })
export class OrganizationMember extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: OrganizationRole,
    default: OrganizationRole.STAFF,
  })
  role: OrganizationRole;

  @Column({ type: 'timestamptz', name: 'joined_at' })
  joinedAt: Date;

  /**
   * The user who invited this member, if any. Nullable because the
   * very first member of an organization (its creator/owner) wasn't
   * invited by anyone.
   */
  @Column({ type: 'uuid', nullable: true, name: 'invited_by' })
  invitedBy: string | null;
}
