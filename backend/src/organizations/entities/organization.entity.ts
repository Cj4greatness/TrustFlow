import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING_SETUP = 'pending_setup',
  CANCELLED = 'cancelled',
}

export enum SubscriptionPlan {
  TRIAL = 'trial',
  STARTER = 'starter',
  GROWTH = 'growth',
  ENTERPRISE = 'enterprise',
}

/**
 * Organization
 *
 * The tenant boundary for TrustFlow. Every business that signs up is
 * represented by exactly one Organization. Users relate to
 * organizations many-to-many via OrganizationMember (Module 4) — this
 * entity has no direct user references, since a user may belong to
 * multiple organizations.
 *
 * Every future business-data module (Customers, Products, Orders,
 * Finance, etc.) will carry an organizationId foreign key back to
 * this entity, following the shared-database / shared-schema
 * multi-tenancy model.
 */
@Entity('organizations')
export class Organization extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  timezone: string | null;

  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.TRIAL,
    name: 'subscription_plan',
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.PENDING_SETUP,
  })
  status: OrganizationStatus;
}
